/**
 * logId.js — mỗi việc có một mã, và log viết SONG SONG hai dạng.
 *
 * Vấn đề: log của bot là `console.log` rải rác hơn 30 module. Khi có sự cố
 * ("mod bấm /ban xong không thấy embed", "AI trả lời sai"), người đọc phải tự
 * đoán các dòng log nào thuộc cùng MỘT lần xử lý — không có gì nối chúng lại.
 * Hai request song song còn dính vào nhau. Đó chính là lý do lần chẩn đoán CI
 * gần nhất phải tải log về đọc tay từng dòng.
 *
 * Cách sửa: mỗi "việc" (một interaction, một vòng tick, một lần gọi AI) sinh
 * một mã ngắn, mọi log phát ra trong phạm vi việc đó tự mang theo mã. Không cần
 * sửa từng chỗ gọi `console.log` — mã lấy từ AsyncLocalStorage, nên code cũ cũng
 * được gắn miễn phí khi nằm trong một `withId()`.
 *
 * Vì sao DUAL-WRITE chứ không thay thế:
 *   - Dòng text giữ nguyên như cũ (đúng thứ pm2 logs / `journalctl` / mắt
 *     người quen dùng). Không phá gì đang chạy.
 *   - Dòng JSON là bản máy đọc được, để sau này gom log theo id, đếm lỗi, tìm
 *     một lần xử lý trong cả ngày. Được gắn nhãn bằng tiền tố riêng để lọc.
 *
 * Nguyên tắc: **never throw**. Log hỏng không được làm hỏng request.
 */
const { AsyncLocalStorage } = require("node:async_hooks");
const { randomBytes } = require("node:crypto");

/** Tiền tố dòng JSON — công cụ gom log lọc theo đúng chuỗi này. */
const JSON_PREFIX = "@json ";

const store = new AsyncLocalStorage();

/**
 * Sinh mã ngắn đủ để không đụng nhau trong 1 bot đơn.
 * Dùng base36 từ `randomBytes`: ngắn (8 ký tự) nhưng KHÔNG đoán được, tránh việc
 * kẻ xấn tự đặt id để làm nhiễu log. base36 ngẫu nhiên yếu hơn base36 đếm
 * tăng (đoán được mạch) — ở đây chọn an toàn hơn là đúng.
 */
function newId() {
  try {
    return randomBytes(5).toString("hex").slice(0, 8);
  } catch {
    return "00000000";
  }
}

/** Mã của phạm vi việc đang chạy, hoặc null ngoài phạm vi. */
function currentId() {
  try {
    return store.getStore() ?? null;
  } catch {
    return null;
  }
}

/**
 * Chạy `fn` trong phạm vi có mã. Mọi `log.*` bên trong (kể cả trong hàm được
 * gọi sâu 5 tầng, kể cả trong callback của timer đã khai báo TRƯỚC khi vào
 * phạm vi chỉ nếu callback đó chạy đồng bộ) đều tự mang mã này.
 *
 *   await withId(() => handleInteraction(interaction));
 *
 * Trả về đúng giá trị của `fn`, và ném lại đúng lỗi gốc.
 *
 * CẢNH BÁO: timer được đặt BÊN TRONG phạm vi sẽ giữ mã này mãi mãi (nó chạy
 * ở ngữ cảnh lúc đặt). Vì vậy chỉ bọc phần xử lý một việc, TUYỆT ĐỐI không bọc
 * khai báo `setInterval` hay các hàm chạy nền — nếu không mọi dòng log sau đó
 * sẽ mang một mã cũ và khiến việc truy vết theo id thành vô nghĩa.
 */
function withId(fn, id = newId()) {
  return store.run(id, fn);
}

/**
 * Bọt các giá trị không serialize được (Error, BigInt, vòng lặp) thành chuỗi
 * để JSON.stringify không ném — một log hỏng mất luôn dòng log đó.
 */
function safeFields(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields ?? {})) {
    if (v === undefined) continue;
    if (v instanceof Error) out[k] = { name: v.name, message: v.message };
    else if (typeof v === "bigint") out[k] = v.toString();
    else if (typeof v === "object" && v !== null) {
      try {
        out[k] = JSON.parse(JSON.stringify(v));
      } catch {
        out[k] = "[không serialize được]";
      }
    } else out[k] = v;
  }
  return out;
}

/**
 * Ghi MỘT dòng log ở cả hai dạng.
 *
 * `level`: "info" | "warn" | "error" | "debug"
 * `fields`: dữ liệu kèm theo — có trong cả hai dạng.
 *
 * Nếu không có mã trong phạm vi thì vẫn ghi (chỉ thiếu trường `id`): mất dòng
 * log để đổi lấy một trường không có là cái giá quá đắt.
 */
function emit(level, msg, fields) {
  try {
    const id = currentId();
    const extra = safeFields(fields);
    const stamp = new Date().toISOString();

    // 1) Dòng text — giữ nguyên kiểu cũ để không phá gì đang đọc log.
    const tail = Object.keys(extra).length ? ` ${JSON.stringify(extra)}` : "";
    console.log(`[${level}]${id ? ` [${id}]` : ""} ${msg}${tail}`);

    // 2) Dòng JSON — cho công cụ gom log. Lỗi ở đây KHÔNG được làm mất dòng 1.
    try {
      console.log(`${JSON_PREFIX}${JSON.stringify({ ts: stamp, level, msg, id, ...extra })}`);
    } catch {
      // bỏ qua: dòng text đã in xong
    }
  } catch {
    // never throw — log hỏng không được làm hỏng request
  }
}

const log = {
  info: (msg, fields) => emit("info", msg, fields),
  warn: (msg, fields) => emit("warn", msg, fields),
  error: (msg, fields) => emit("error", msg, fields),
  debug: (msg, fields) => emit("debug", msg, fields),
};

module.exports = { log, withId, currentId, newId, emit, JSON_PREFIX };
