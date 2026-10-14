// Plugin session-history — "hộp lưu lịch sử làm việc" cho agent trên VPS.
//
// Ý tưởng (yêu cầu của chủ bot 18/09/2026): mỗi phiên làm việc của OpenCode
// được ghi một dòng tóm tắt vào một hộp lịch sử riêng; sau khoảng thời gian
// tùy ý (mặc định 14 ngày) mục cũ tự bị dọn — đúng tinh thần "history
// có hạn sử dụng" thay vì chất đống mãi mãi.
//
// Cách hoạt động (dạng V2 — OpenCode 2.x):
//   - default export `{ id, setup(ctx) }`; setup đăng ký event stream qua
//     ctx.event.subscribe() và trả về hàm dọn (abort controller) để plugin
//     unload là stream đóng.
//     ⚠️ Bản V1 (export hàm trả về object hook `event`) KHÔNG còn được nạp:
//     log báo "Plugin must export a default definition with an id and an
//     effect or setup function" và hộp lịch sử ngừng ghi IM LẶNG (11/10/2026).
//   - Lắng nghe session.created / session.idle / session.execution.failed
//     (V2 bỏ `session.error` — lỗi phiên phát qua session.execution.failed
//     kèm data.error.message).
//   - Ghi mỗi mục dạng JSONL vào ~/.config/opencode/history/sessions.jsonl
//     (một dòng một phiên — dễ đọc bằng tail/jq, không cần DB). GIỮ NGUYÊN tên
//     trường (at/event/sessionId/title/directory/error) vì lệnh /history và
//     test-agent-history đọc đúng các trường này.
//   - Dọn mục quá hạn NGAY TRƯỚC KHI ghi mục mới: rẻ, không cần cron, không
//     chặn phiên (lỗi dọn bị nuốt, không bao giờ làm rớt phiên làm việc)
//   - TTL đọc từ biến môi trường AGENT_HISTORY_TTL_DAYS (mặc định 14, set 0
//     để tắt hẳn auto-dọn — giữ vô hạn)
//   - Công cụ /history trong .opencode/commands đọc hộp này cho người dùng
//
// Plugin chạy local bằng fs API — không phụ thuộc mạng, không token AI.

import { join } from "path";
import { homedir } from "os";
import fs from "fs";

const DEFAULT_TTL_DAYS = 14;

export default {
  id: "session-history",

  setup(ctx) {
    const dir = join(homedir(), ".config", "opencode", "history");
    const file = join(dir, "sessions.jsonl");

    // Ghi nối tiếp dùng fs API đồng bộ — Bun Shell KHÔNG có .redirection()
    // (đã xác minh: TypeError at runtime), dùng nó là lịch sử mất im lặng.
    // mkdir recursive: thư mục history chưa tồn tại cũng ghi được ngay.
    function appendLine(line) {
      fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(file, line);
    }

    // Trả về số mục đã dọn (0 = không có gì quá hạn). Ghi/dọn bằng fs API —
    // shell chỉ dùng cho mkdir (best-effort).
    function pruneExpired() {
      const ttlDays = Number(process.env.AGENT_HISTORY_TTL_DAYS ?? DEFAULT_TTL_DAYS);
      if (!Number.isFinite(ttlDays) || ttlDays <= 0) return 0; // 0 = tắt dọn, giữ vô hạn
      try {
        let raw = "";
        try {
          raw = fs.readFileSync(file, "utf8");
        } catch {
          return 0; // file chưa tồn tại
        }
        const cutoff = Date.now() - ttlDays * 24 * 60 * 60 * 1000;
        const kept = [];
        let pruned = 0;
        for (const line of raw.split("\n")) {
          if (!line.trim()) continue;
          try {
            const entry = JSON.parse(line);
            if ((entry.at ?? 0) >= cutoff) kept.push(line);
            else pruned++;
          } catch {
            kept.push(line); // dòng hỏng: giữ lại, đừng mất dữ liệu người dùng
          }
        }
        if (pruned > 0) {
          fs.writeFileSync(file, kept.length ? kept.join("\n") + "\n" : "");
        }
        return pruned;
      } catch {
        return 0; // lỗi dọn không được phép ảnh hưởng phiên làm việc
      }
    }

    function append(entry) {
      try {
        appendLine(JSON.stringify(entry) + "\n");
        pruneExpired();
      } catch {
        // Ghi lịch sử là best-effort — thất bại không được làm rớt phiên.
      }
    }

    // Sự kiện V2 dạng { type, data } (Payload của @opencode/schema):
    //   session.created        → data.{sessionID,title,location.directory}
    //   session.idle           → data.sessionID (phiên vừa xong một lượt)
    //   session.execution.failed → data.sessionID + data.error.{type,message}
    const controller = new AbortController();
    void (async () => {
      try {
        for await (const ev of ctx.event.subscribe({ signal: controller.signal })) {
          if (ev.type === "session.created") {
            append({
              at: Date.now(),
              event: "created",
              sessionId: String(ev.data?.sessionID ?? ev.durable?.aggregateID ?? ""),
              title: String(ev.data?.title ?? "(chưa đặt tên)"),
              directory: String(ev.data?.location?.directory ?? ""),
            });
          } else if (ev.type === "session.idle") {
            append({
              at: Date.now(),
              event: "idle", // phiên hoàn thành một lượt làm việc
              sessionId: String(ev.data?.sessionID ?? ""),
            });
          } else if (ev.type === "session.execution.failed") {
            append({
              at: Date.now(),
              event: "error",
              sessionId: String(ev.data?.sessionID ?? ""),
              error: String(ev.data?.error?.message ?? "").slice(0, 300),
            });
          }
        }
      } catch {
        // Stream đóng (plugin unload / server dừng) là bình thường — không được
        // làm rớt phiên vì lỗi đọc sự kiện.
      }
    })();

    // Plugin unload → cắt stream, trả tài nguyên về cho OpenCode.
    return () => controller.abort();
  },
};
