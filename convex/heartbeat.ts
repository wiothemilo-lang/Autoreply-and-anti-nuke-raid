/**
 * Nhịp tim của bot — nguồn số DUY NHẤT cho phía Convex.
 *
 * Vì sao tách ra file riêng: trước đây `status.ts` tự khai 360s còn `backup.ts`
 * tự khai 180s cho CÙNG một câu hỏi "bot còn sống không". Hai bản sao lệch
 * nhau = hai màn hình trả lời hai đáp án khác nhau về cùng một con bot, và
 * không có gì báo sai (bug thật: bảng Backup báo "bot offline" trong khi bot
 * vẫn sync đều).
 *
 * NHỊP THẬT (đọc từ bot, đừng đoán):
 *   · `bot/src/index.js` — `setTimeout(runSyncLoop, 180_000)`, hẹn nhịp KẾ
 *     TIẾP sau khi lượt trước chạy xong ⇒ chu kỳ ≥ 180s (180s + thời gian sync).
 *   · Heartbeat được gộp vào chính `guilds:botSyncGuilds` (globalStatus) nên
 *     `botStatus.lastHeartbeat` được ghi lại mỗi chu kỳ đó.
 *
 * `BOT_SYNC_INTERVAL_MS` là CHU KỲ THẤP NHẤT có thể có, không phải giá trị cam
 * kết: mọi ngưỡng "còn tươi" phải rộng hơn nó, nếu không sẽ có khoảng thời
 * gian bot sống bình thường mà web báo mất kết nối.
 */
export const BOT_SYNC_INTERVAL_MS = 180_000;

/**
 * Cửa sổ coi bot còn "online" — 2 nhịp.
 *
 * Rộng 2 nhịp = bỏ qua được 1 nhịp lỡ (sync chậm, mạng chớp) mà vẫn phát hiện
 * bot chết trong ~6 phút. Lấy đúng 1 nhịp (180s) thì ngay trước mỗi nhịp,
 * tuổi heartbeat đã > 180s ⇒ huy hiệu online nhấp nháy offline vài giây mỗi
 * 3 phút — đúng lỗi "web báo bot mất kết nối" dù bot đang chạy.
 */
export const BOT_ONLINE_WINDOW_MS = 2 * BOT_SYNC_INTERVAL_MS;
