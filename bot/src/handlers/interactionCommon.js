// Tiện ích dùng chung cho "họ" module tách từ handlers/interactionCreate.js
// (đợt #5 tách monolith — 03/10/2026). Chỉ CHUYỂN CHỖ code, không đổi hành vi.
//
// Vì sao tách riêng: `needPerm` được cả nhóm lệnh chung lẫn nhóm mod/community
// gọi. Đặt nó trong một nhóm sẽ buộc các nhóm còn lại require chéo nhóm đó —
// đường phụ thuộc vòng không cần thiết.

/**
 * Danh sách module antinuke — nguồn DUY NHẤT dùng chung cho `/antinuke module`
 * (kiểm hợp lệ), autocomplete, và lệnh prefix `!antinuke module`. Để ở đây
 * (không phải trong `interactionCmdMod.js`) vì `interactionCommon` không
 * require chéo nhóm nào, nên các nơi khác import lại mà không tạo vòng.
 *
 * PHẢI khớp `ANTI_NUKE_MODULES` trong `convex/modules.ts` (nguồn chân lý mà
 * dashboard + `botModuleUpdate` dùng). Trước đây danh sách này thiếu 12 module
 * (massThreadDelete, massChannelRename, massChannelOverwrite, massRoleEdit,
 * adminSelfGrant, massRoleAssign, massNickname, massEmoji, massBotAdd,
 * externalAppRaid, massInviteCreate, guildTamper) → lệnh slash từ chối những
 * module mà dashboard và lệnh prefix vẫn bật/tắt được. Thứ tự bám theo
 * convex/modules.ts để đọc/diff dễ.
 */
const MODULES = [
  "massBan",
  "massKick",
  "massJoin",
  "massChannelCreate",
  "massChannelDelete",
  "massRoleCreate",
  "massRoleDelete",
  "massMessageDelete",
  "massWebhookCreate",
  "massThreadCreate",
  "massThreadDelete",
  "massChannelRename",
  "massChannelOverwrite",
  "massRoleEdit",
  "adminSelfGrant",
  "massRoleAssign",
  "massNickname",
  "massEmoji",
  "massBotAdd",
  "botHitAndRun",
  "suspiciousBotAlert",
  "externalAppRaid",
  "massInviteCreate",
  "guildTamper",
  "massMessage",
  "blankNoise",
  "spam",
  "mention",
  "badword",
  "attachment",
  "invite",
  "malware",
];

function needPerm(interaction) {
  return interaction.reply({
    content:
      "❌ Bạn không có quyền dùng lệnh này — cần quyền **Quản lý server** hoặc role **Mod/Admin** được cấu hình qua `/setup`.",
    ephemeral: true,
  });
}

/**
 * Gợi ý autocomplete cho option có `autocomplete: true` trong slash.js.
 *
 * Discord chỉ gửi loại tương tác này cho option STRING/INTEGER/NUMBER (không có
 * choices). Ta trả về tối đa 25 gợi ý khớp phần người dùng đã gõ.
 *
 * Nguyên tắc:
 *  - Đọc cấu hình hỏng/không có → trả danh sách RỖNG, tuyệt đối không ném:
 *    lỗi Convex mà để Discord treo gợi ý là trải nghiệm tệ hơn không có gợi ý.
 *  - Nguồn dữ liệu là cấu hình ĐÃ CACHE của store (`getConfig`) — không thêm
 *    query mới cho mỗi thao tác gõ phím.
 */
async function autocomplete(store, interaction) {
  const focused = interaction.options.getFocused(true); // { name, value }
  const sub = interaction.options.getSubcommand(false);
  const command = interaction.commandName;
  const guild = interaction.guild;
  let choices = [];

  if (guild) {
    let config = null;
    try {
      config = await store.getConfig(guild.id);
    } catch {
      // đọc cấu hình lỗi → giữ null (gợi ý rỗng), KHÔNG để Discord treo
    }
    if (
      command === "autoreply" &&
      (sub === "edit" || sub === "remove") &&
      focused.name === "name"
    ) {
      choices = (config?.autoReplies || []).map((r) => ({ name: r.name, value: r.name }));
    } else if (command === "badword" && sub === "remove" && focused.name === "word") {
      choices = (config?.badWords || []).map((w) => ({ name: w, value: w }));
    } else if (command === "antinuke" && sub === "module" && focused.name === "module") {
      choices = MODULES.map((m) => ({ name: m, value: m }));
    }
  }

  const q = String(focused.value ?? "").toLowerCase();
  const filtered = (q ? choices.filter((c) => c.name.toLowerCase().includes(q)) : choices).slice(
    0,
    25,
  );
  return interaction.respond(filtered);
}

module.exports = { needPerm, MODULES, autocomplete };
