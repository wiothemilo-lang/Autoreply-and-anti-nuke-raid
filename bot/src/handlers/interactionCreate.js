// Định tuyến tương tác Discord — điểm vào duy nhất cho mọi slash command, nút
// và modal. Sau đợt #5 tách monolith (03/10/2026), file này chỉ còn ĐỊNH TUYẾN:
// mỗi nhánh gọi sang module chuyên trách, thân code nằm ở đó.
//
//   ./interactionVerify.js       — nút verify_request_captcha / verify_confirm
//   ./interactionTicketFlow.js   — nút + modal + /ticket
//   ./interactionCmdGeneral.js   — /report /research /ticket /ping /language
//                                  /health /help /prefix /autoreply /badword /heat
//   ./interactionCmdMod.js       — /lock /antinuke /mod
//   ./interactionCmdCommunity.js — /giveaway /reactionrole
//   ./interactionCmdBackup.js    — /backup
//   ./interactionCmdSetup.js     — /verify /setup /alt
//
// Hợp đồng với test tĩnh: mọi lệnh đã đăng ký trong `commands/slash.js` PHẢI có
// `case "..."` trong switch bên dưới (test-commands-flow-e2e + test-slash-
// command-contract đọc trực tiếp file này để đối chiếu cây lệnh).

const verifyFlow = require("./interactionVerify");
const ticketFlow = require("./interactionTicketFlow");
const generalCmds = require("./interactionCmdGeneral");
const modCmds = require("./interactionCmdMod");
const communityCmds = require("./interactionCmdCommunity");
const backupCmd = require("./interactionCmdBackup");
const setupCmd = require("./interactionCmdSetup");

module.exports = async function onInteractionCreate(client, interaction, store, heat) {
  // Handle button interactions (verify_confirm + verify_request_captcha)
  if (interaction.isButton()) {
    if (interaction.customId === "verify_request_captcha") {
      return verifyFlow.handleVerifyRequestCaptcha(store, interaction);
    }
    if (interaction.customId === "verify_confirm") {
      return verifyFlow.handleVerifyConfirm(store, interaction);
    }
    // ─── TICKET: nút mở khiếu nại trong DM sau ban ───
    if (interaction.customId.startsWith("ticket_open:")) {
      return ticketFlow.ticketOpenButton(client, store, interaction);
    }
    if (interaction.customId === "ticket_open_dm") {
      return ticketFlow.ticketOpenDmButton(client, store, interaction);
    }
    if (interaction.customId.startsWith("ticket_")) {
      return ticketFlow.ticketActionButton(client, store, interaction);
    }
    return;
  }

  // ─── TICKET: modal mở ticket từ panel kênh công khai ───
  if (interaction.isModalSubmit() && interaction.customId.startsWith("ticket_open_submit:")) {
    return ticketFlow.ticketOpenSubmitModal(client, store, interaction);
  }
  // ─── TICKET: modal khiếu nại (sau nút trong DM) ───
  if (interaction.isModalSubmit() && interaction.customId === "ticket_appeal_dm") {
    return ticketFlow.ticketAppealModal(client, store, interaction);
  }
  // ─── TICKET: modal ghi chú AI (nút trong kênh ticket) ───
  if (interaction.isModalSubmit() && interaction.customId === "ticket_ai_note") {
    return ticketFlow.ticketAiModal(client, store, interaction);
  }
  // ─── TICKET: modal đóng kèm lý do ───
  if (
    interaction.isModalSubmit() &&
    interaction.customId.startsWith("ticket_close_reason_submit:")
  ) {
    return ticketFlow.ticketCloseReasonModal(client, store, interaction);
  }

  if (!interaction.isChatInputCommand()) return;

  const name = interaction.commandName;
  const guild = interaction.guild;

  // `/language` là lệnh DUY NHẤT chạy được trong DM: người bị ban không vào
  // được kênh nào của server, nhưng họ vẫn cần đổi ngôn ngữ cho các lần
  // khiếu nại sau. Vì vậy nó được miễn qua chặn guild bên dưới.
  if (!guild && name !== "language") {
    return interaction.reply({ content: "Lệnh này chỉ hoạt động trong server.", ephemeral: true });
  }

  switch (name) {
    // ── Nhóm lệnh chung (interactionCmdGeneral.js) ──
    case "report":
      return generalCmds.report(client, store, interaction);
    case "research":
      return generalCmds.research(client, store, interaction);
    case "ticket":
      return generalCmds.ticket(client, store, interaction, guild);
    case "ping":
      return generalCmds.ping(client, interaction);
    case "language":
      return generalCmds.language(store, interaction);
    case "health":
      return generalCmds.health(client, store, interaction, guild);
    case "help":
      return generalCmds.help(interaction);
    case "prefix":
      return generalCmds.prefix(store, interaction, guild);
    case "autoreply":
      return generalCmds.autoreply(store, interaction, guild);
    case "badword":
      return generalCmds.badword(store, interaction, guild);
    case "heat":
      return generalCmds.heat(store, interaction, guild);

    // ── Nhóm moderation (interactionCmdMod.js) ──
    case "lock":
      return modCmds.lock(client, store, interaction);
    case "antinuke":
      return modCmds.antinuke(client, store, interaction, guild);
    case "mod":
      return modCmds.mod(store, interaction, guild, heat);

    // ── Nhóm cộng đồng (interactionCmdCommunity.js) ──
    case "giveaway":
      return communityCmds.giveaway(store, interaction, guild);
    case "reactionrole":
      return communityCmds.reactionrole(store, interaction, guild);

    // ── Backup (interactionCmdBackup.js) ──
    case "backup":
      return backupCmd.backup(store, interaction, guild);

    // ── Cấu hình (interactionCmdSetup.js) ──
    case "verify":
      return setupCmd.verify(store, interaction, guild);
    case "setup":
      return setupCmd.setup(store, interaction, guild);
    case "alt":
      return setupCmd.alt(store, interaction, guild);

    default:
      return interaction.reply({ content: "Lệnh chưa được hỗ trợ.", ephemeral: true });
  }
};
