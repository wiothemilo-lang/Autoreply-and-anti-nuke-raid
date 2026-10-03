// Tiện ích dùng chung cho "họ" module tách từ handlers/interactionCreate.js
// (đợt #5 tách monolith — 03/10/2026). Chỉ CHUYỂN CHỖ code, không đổi hành vi.
//
// Vì sao tách riêng: `needPerm` được cả nhóm lệnh chung lẫn nhóm mod/community
// gọi. Đặt nó trong một nhóm sẽ buộc các nhóm còn lại require chéo nhóm đó —
// đường phụ thuộc vòng không cần thiết.

function needPerm(interaction) {
  return interaction.reply({
    content:
      "❌ Bạn không có quyền dùng lệnh này — cần quyền **Quản lý server** hoặc role **Mod/Admin** được cấu hình qua `/setup`.",
    ephemeral: true,
  });
}

module.exports = { needPerm };
