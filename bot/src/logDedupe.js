// Chống gửi TRÙNG log — module thuần (không phụ thuộc discord.js) để test hermetic.
//
// Bối cảnh: cấu hình kênh log có nhiều nhánh (kênh log chung, kênh log hành động
// mod, kênh hình phạt) và bot có hai luồng gửi riêng (sendLog cho sự kiện hệ
// thống/anti-nuke, sendModLog cho case moderation). Khi các nhánh đó cùng nhắm
// MỘT kênh, cùng một embed có thể bị đẩy hai lần trong vài giây — người dùng
// thấy log nhân đôi, không phân biệt được là hai sự kiện hay một sự kiện bị lặp.
//
// Chốt này chỉ chặn đúng trường hợp "y hệt nhau, cùng kênh, trong cửa sổ ngắn":
//   - khác kênh → vẫn gửi (định tuyến khác nhau là chủ ý),
//   - khác nội dung → vẫn gửi (2 vi phạm thật trong cùng giây vẫn phải báo),
//   - quá cửa sổ → vẫn gửi.
const DUP_WINDOW_MS = 3000;
const MAX_ENTRIES = 500;

/** key → thời điểm gửi gần nhất. */
const recent = new Map();

/** Lấy dữ liệu embed bất kể là EmbedBuilder thật (data/d) hay object thô. */
function embedData(embed) {
  return embed?.data ?? embed?.d ?? embed ?? {};
}

/**
 * Chữ ký nhận dạng nội dung: tiêu đề + mô tả + các field + footer.
 * Cắt ngắn để không giữ chuỗi lớn trong bộ nhớ.
 */
function signatureOf(channelId, embed) {
  const d = embedData(embed);
  const fields = (d.fields ?? [])
    .map((f) => `${f.name ?? ""}=${String(f.value ?? "").slice(0, 80)}`)
    .join("|");
  const footer = d.footer?.text ?? d.footer ?? "";
  return [
    channelId,
    d.title ?? "",
    String(d.description ?? "").slice(0, 240),
    fields,
    String(footer).slice(0, 80),
  ].join("::");
}

/**
 * true = bản ghi này vừa được gửi vào ĐÚNG kênh đó trong cửa sổ chống trùng
 * (caller nên bỏ qua). Lần gọi đầu tiên luôn trả false và tự ghi dấu.
 * `now` cho phép test bơm thời gian giả.
 */
function isDuplicateDelivery(channelId, embed, now = Date.now()) {
  if (!channelId) return false;
  const key = signatureOf(channelId, embed);
  const last = recent.get(key) ?? 0;
  if (now - last < DUP_WINDOW_MS) return true;
  recent.set(key, now);
  if (recent.size > MAX_ENTRIES) {
    for (const [k, t] of recent) {
      if (now - t >= DUP_WINDOW_MS) recent.delete(k);
    }
    // Burst log > MAX_ENTRIES trong cùng cửa sổ 3s: vòng trên không xoá được gì
    // (mọi entry còn hạn) → Map phình vô hạn. Cắt entry CŨ NHẤT (Map giữ thứ tự
    // chèn) cho tới khi về trần; chấp nhận có thể bỏ sót 1 log trùng cực hiếm.
    while (recent.size > MAX_ENTRIES) {
      recent.delete(recent.keys().next().value);
    }
  }
  return false;
}

/** Xoá bộ nhớ chống trùng (test). */
function __resetLogDedupeForTest() {
  recent.clear();
}

module.exports = { isDuplicateDelivery, __resetLogDedupeForTest, DUP_WINDOW_MS };
