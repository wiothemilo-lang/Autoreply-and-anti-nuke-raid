/**
 * backupCommon.js — helper + trần dùng chung giữa nhánh chụp (backupCapture) và
 * nhánh khôi phục (backupRebuild / backupRestore). Tách từ handlers/backup.js
 * (đợt #5) — code giữ nguyên hành vi.
 *
 * Chỉ phụ thuộc ./util nên mọi module backup đều import được mà không tạo vòng.
 */
const { sendLog } = require("./util");

/** Số tin nhắn tối đa chụp/phục hồi mỗi thread. */
const MAX_MESSAGES_PER_THREAD = 10;
/** Số tin nhắn tối đa phục hồi lại mỗi kênh khi restore (giới hạn thời gian chạy). */
const MAX_REPLAY_PER_CHANNEL = 50;
/** Số thread đang hoạt động tối đa chụp mỗi kênh (tránh phình JSON khi server chat sôi). */
const MAX_THREADS_PER_CHANNEL = 20;
/**
 * Số thành viên TỐI ĐA chụp bản đồ vai trò (P2).
 *
 * Vì sao có trần: server 50k thành viên mà bản đồ đầy đủ sẽ phình JSON vượt
 * trần 1 MB của Convex, và lúc restore phải gọi hàng chục nghìn lần
 * members.addRoles → chạm rate limit và treo job. 500 là mức đủ phục hồi
 * phần lớn server cộng đồng vừa/nhỏ mà vẫn nằm gọn trong 1 lần backup.
 * Vượt trần thì BÁO bằng cờ `memberRolesTruncated` — cắt bớt mà im lặng
 * khiến chủ server tưởng đã lưu đủ.
 */
const MAX_MEMBERS_PER_BACKUP = 500;
/** Số vai trò tối đa ghi cho MỘT thành viên (thành viên có 50 role là rác). */
const MAX_ROLES_PER_MEMBER = 20;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * URL icon/avatar của server, luôn trả về chuỗi hoặc null. `guild.iconURL` có
 * thể không phải hàm (guild giả, client cũ) hoặc văng lỗi — gọi trực tiếp là
 * hỏng cả lần khôi phục chỉ vì thứ trang trí.
 */
function safeGuildIconUrl(guild, size = 128) {
  try {
    if (typeof guild?.iconURL === "function") return guild.iconURL({ size }) ?? null;
    return typeof guild?.iconURL === "string" ? guild.iconURL : null;
  } catch (e) {
    console.error(`[backup:icon] ${guild?.name ?? "?"}:`, e.message);
    return null;
  }
}

/** Lấy bitfield quyền hiệu dụng của bot (dùng để không cấp quyền vượt quá bot). */
function myPermissionBits(guild) {
  return guild.members.me?.permissions?.bitfield ?? 0n;
}

/** Gửi embed tới kênh log của guild qua webhook (giống các handler khác). */
async function sendToLog(guild, embed, store) {
  try {
    const config = store ? await store.getConfig(guild.id).catch(() => null) : null;
    await sendLog(guild, config, embed);
  } catch {
    // webhook chưa sẵn sàng hoặc chưa set kênh log — bỏ qua
  }
}

module.exports = {
  MAX_MESSAGES_PER_THREAD,
  MAX_REPLAY_PER_CHANNEL,
  MAX_THREADS_PER_CHANNEL,
  MAX_MEMBERS_PER_BACKUP,
  MAX_ROLES_PER_MEMBER,
  sleep,
  safeGuildIconUrl,
  myPermissionBits,
  sendToLog,
};
