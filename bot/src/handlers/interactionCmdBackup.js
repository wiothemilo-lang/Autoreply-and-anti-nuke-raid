// Lệnh `/backup` — tách từ handlers/interactionCreate.js (đợt #5 tách monolith —
// 03/10/2026). Chỉ CHUYỂN CHỖ code, không đổi hành vi.
//
// Đây là thân `case "backup"` cũ, đổi vỏ thành hàm nhận tham số. Giữ nguyên
// các marker `if (sub === "...")` + comment vì test hợp đồng tĩnh
// (`scripts/test-interaction-create.cjs`) đọc đúng file này để đối chiếu với
// cây lệnh trong `commands/slash.js` — lệch 1 chữ là option không bao giờ nhận
// giá trị.

const { EmbedBuilder, Colors } = require("discord.js");
const { canManageGuild } = require("../util");
const { verifyBackup, formatVerifyReport } = require("../backupAudit");
const { needPerm } = require("./interactionCommon");

/** `/backup` — list/restore/verify/auto/keep/now. */
async function backup(store, interaction, guild) {
  const sub = interaction.options.getSubcommand();
  const guildId = guild.id;

  if (sub === "list") {
    const list = await store.client.query("backup:listGuild", { guildId }).catch(() => null);
    if (!list || list.length === 0) {
      return interaction.reply({
        content: "Chưa có backup nào của server này — dùng `/backup now` để tạo bản đầu tiên.",
        ephemeral: true,
      });
    }
    const lines = list.map(
      (b, i) =>
        `${i + 1}. **${b.guildName}** — ${new Date(b.createdAt).toLocaleString("vi-VN")} — ${b.roleCount} role · ${b.channelCount} kênh${b.pushedToGithub ? " · ☁️ GitHub" : ""}`,
    );
    // Danh sách có thể tới 50 bản (quy tắc "Giữ bản" 2-50) nhưng embed chỉ
    // chịu 4096 ký tự — in hết một lượt là Discord từ chối cả embed. In 20
    // bản mới nhất, phần còn lại chỉ sang dashboard.
    const shown = lines.slice(0, 20);
    if (lines.length > shown.length) {
      shown.push(
        `… và ${lines.length - shown.length} bản nữa — xem và khôi phục các bản cũ hơn trên dashboard.`,
      );
    }
    const embed = new EmbedBuilder()
      .setColor(Colors.Blurple)
      .setTitle(`💾 Backup của server (${list.length})`)
      .setDescription(shown.join("\n"))
      .setFooter({ text: "Khôi phục: /backup restore <số thứ tự>" });
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  if (sub === "restore") {
    if (!canManageGuild(interaction.member)) return needPerm(interaction);
    const idx = interaction.options.getInteger("index", true);
    const list = await store.client.query("backup:listGuild", { guildId }).catch(() => null);
    const backup = list && list[idx - 1];
    if (!backup) {
      return interaction.reply({
        content: `Không tìm thấy backup số ${idx} — chạy /backup list để xem danh sách.`,
        ephemeral: true,
      });
    }
    try {
      await store.client.mutation("bot_writes:botSetRestoreRequest", {
        guildId,
        backupId: backup._id,
      });
      store.invalidate(guildId);
      return interaction.reply({
        content: `✅ Đã yêu cầu khôi phục backup của **${backup.guildName}** (${backup.roleCount} role · ${backup.channelCount} kênh) — bot tạo lại cấu trúc trong ~1 phút.`,
        ephemeral: true,
      });
    } catch (e) {
      return interaction.reply({ content: `❌ ${e.message}`, ephemeral: true });
    }
  }

  // /backup verify <index> — CHỈ ĐỌC: bung JSON, kiểm chunk đủ chưa, đếm
  // thật role/kênh/emoji/sticker/tin và báo từng sai lệch so với số đã lưu.
  // KHÔNG gọi mutation, KHÔNG tạo gì — verify không đụng guild.
  if (sub === "verify") {
    if (!canManageGuild(interaction.member)) return needPerm(interaction);
    const idx = interaction.options.getInteger("index", true);
    // botAuditBackups trả NỘI DUNG đầy đủ (đã ghép chunk) + checksum —
    // listGuild cố tình bỏ backupJson nên KHÔNG kiểm tra được gì.
    const rows = await store.client.query("backup:botAuditBackups", { guildId }).catch(() => null);
    if (!rows || rows.length === 0) {
      return interaction.reply({
        content: "Chưa có backup nào của server này.",
        ephemeral: true,
      });
    }
    const backup = rows[idx - 1];
    if (!backup) {
      return interaction.reply({
        content: `Không tìm thấy backup số ${idx} — chạy /backup list để xem danh sách.`,
        ephemeral: true,
      });
    }
    const report = verifyBackup(backup);
    const embed = new EmbedBuilder()
      .setColor(report.ok ? (report.deviations.length ? Colors.Yellow : Colors.Green) : Colors.Red)
      .setTitle(`🔎 Kiểm tra backup #${idx} — ${backup.guildName || "server"}`)
      .setDescription(formatVerifyReport(report).join("\n"))
      .setFooter({ text: "Chỉ kiểm tra — không thay đổi gì trong server" });
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  if (sub === "auto") {
    if (!canManageGuild(interaction.member)) return needPerm(interaction);
    const days = interaction.options.getInteger("days", true);
    if (days !== 0 && (days < 2 || days > 30)) {
      return interaction.reply({
        content: "Số ngày phải từ 2 đến 30 (0 = tắt).",
        ephemeral: true,
      });
    }
    try {
      await store.client.mutation("bot_writes:botSetAutoBackup", { guildId, days });
      store.invalidate(guildId);
      return interaction.reply({
        content:
          days > 0
            ? `✅ Tự động backup mỗi **${days} ngày** — bot tự chụp + đẩy lên GitHub của chủ bot. Xem kết quả: /backup list`
            : "✅ Đã tắt tự động backup — bot chỉ backup khi bạn dùng lệnh hoặc trên dashboard.",
        ephemeral: true,
      });
    } catch (e) {
      return interaction.reply({ content: `❌ ${e.message}`, ephemeral: true });
    }
  }

  // /backup keep <số bản> [số ngày] — quy tắc giữ bản (giống !backup keep).
  // `days` bỏ trống thì GIỮ NGUYÊN quy tắc tuổi đang có: người dùng chỉ
  // muốn đổi số bản không vô tình xoá luôn giới hạn tuổi họ đã đặt.
  if (sub === "keep") {
    if (!canManageGuild(interaction.member)) return needPerm(interaction);
    const count = interaction.options.getInteger("count", true);
    if (count < 2 || count > 50) {
      return interaction.reply({
        content: "Số bản phải từ **2 đến 50** (VD: `/backup keep count:7`).",
        ephemeral: true,
      });
    }
    // Discord trả NULL khi option bỏ trống — gửi null xuống Convex sẽ bị
    // validator v.optional(v.number()) từ chối, nên phải đổi thành undefined
    // (JSON.stringify bỏ field ⇒ server giữ nguyên quy tắc cũ).
    const days = interaction.options.getInteger("days") ?? undefined;
    if (days !== undefined && (days < 0 || days > 365)) {
      return interaction.reply({
        content: "Số ngày phải từ **0 đến 365** (0 = không xoá theo tuổi).",
        ephemeral: true,
      });
    }
    try {
      const res = await store.client.mutation("bot_writes:botSetBackupRetention", {
        guildId,
        keepCount: count,
        keepDays: days,
      });
      // ok=false (VD server chưa có trong DB vì bot vừa vào) KHÔNG được báo
      // thành công — người dùng tin là đã đặt xong nhưng không có gì lưu.
      if (res?.ok !== true) {
        throw new Error(
          res?.reason === "no_guild"
            ? "bot chưa đồng bộ server này — thử lại sau vài phút"
            : "không lưu được quy tắc giữ bản",
        );
      }
      return interaction.reply({
        content: `✅ Quy tắc giữ bản: giữ **${res?.keepCount ?? count} bản** gần nhất${
          res?.keepDays ? ` và xoá bản cũ hơn **${res.keepDays} ngày**` : ""
        }. Có hiệu lực từ lần backup kế tiếp (bản đang có không bị xoá ngay).`,
        ephemeral: true,
      });
    } catch (e) {
      return interaction.reply({ content: `❌ ${e.message}`, ephemeral: true });
    }
  }

  // /backup now — mặc định đẩy lên GitHub (token của chủ bot, dùng chung mọi server)
  if (sub === "now") {
    if (!canManageGuild(interaction.member)) return needPerm(interaction);
    const github = interaction.options.getBoolean("github") ?? true;
    try {
      await store.client.mutation("bot_writes:botSetBackupRequest", {
        guildId,
        pushToGithub: github,
      });
      store.invalidate(guildId);
      return interaction.reply({
        content: github
          ? "✅ Đã yêu cầu tạo backup (đẩy lên GitHub của chủ bot) — bot thực hiện trong ~20 giây. Xem kết quả: `/backup list`"
          : "✅ Đã yêu cầu tạo backup (chỉ lưu trên Convex) — bot thực hiện trong ~20 giây. Xem kết quả: `/backup list`",
        ephemeral: true,
      });
    } catch (e) {
      return interaction.reply({ content: `❌ ${e.message}`, ephemeral: true });
    }
  }

  // Subcommand lạ → KHÔNG được rơi xuống nhánh `now` và âm thầm tạo backup +
  // đẩy server lên GitHub. Đăng ký slash dùng PUT nên thay thế TOÀN BỘ cây
  // lệnh: hễ thêm subcommand mới vào slash.js mà handler chưa kịp sửa, người
  // dùng sẽ gõ đúng lệnh đó và nhận hành vi của `now` — một thao tác ghi dữ
  // liệu + đẩy ra ngoài mà họ không hề được hỏi.
  return interaction.reply({
    content:
      "Subcommand `/backup` không hợp lệ. Dùng: `now` · `list` · `verify <số>` · `restore <số>` · `auto <2-30|0>` · `keep <2-50> [ngày]`.",
    ephemeral: true,
  });
}

module.exports = { backup };
