import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { isHeartbeatFresh } from "./utils";

export interface BotStatus {
  online: boolean;
  guildCount: number;
  memberCount: number;
  lastHeartbeat: number | null;
  ownerName: string | null;
  ownerAvatarUrl: string | null;
  /**
   * Mức sức khoẻ MÁY CHỦ bot (null = chưa có dữ liệu / quá 30 phút không báo).
   * Chủ bot xem số liệu chi tiết ở cửa sổ Admin (status:getHostHealth).
   */
  hostHealth: "ok" | "warn" | "critical" | null;
}

/**
 * MỘT bộ đếm "bây giờ là mấy giờ" dùng chung cho MỌI component gọi
 * useBotStatus.
 *
 * Vì sao gộp (đo 28/09): Landing mount ĐỒNG THỜI Footer và bảng chọn trang — hai
 * consumer, trước đây mỗi đứa tự chạy một setInterval 15s, và cả hai đều
 * chạy tiếp kể cả khi tab đang ẩn (người dùng chuyển sang tab khác/cuộn
 * app khác trên điện thoại). Tab ẩn thì không ai nhìn đồng hồ "còn tươi
 * không" — re-render lúc đó là đốt CPU/pin cho không.
 *
 * Hành vi:
 *   · Chỉ MỘT interval cho toàn app, bắn `now` cho mọi consumer đã đăng ký.
 *   · Tab ẩn → interval im lặng (không setState → không re-render).
 *   · Tab hiện lại → bắn `now` ngay để trạng thái "online/offline" đúng
 *     thực tế, KHÔNG đợi tối đa 15s mới cập nhật.
 */
const NOW_TICK_MS = 15_000;
const nowListeners = new Set<(now: number) => void>();
let sharedTicker: ReturnType<typeof setInterval> | null = null;

function broadcastNow(): void {
  const now = Date.now();
  for (const listener of nowListeners) listener(now);
}

function startSharedTicker(): void {
  if (sharedTicker !== null || typeof window === "undefined") return;
  sharedTicker = window.setInterval(() => {
    if (document.hidden) return;
    broadcastNow();
  }, NOW_TICK_MS);
}

function stopSharedTickerIfIdle(): void {
  if (sharedTicker === null || nowListeners.size > 0) return;
  window.clearInterval(sharedTicker);
  sharedTicker = null;
}

let visibilityBound = false;
function bindVisibilityResync(): void {
  if (visibilityBound || typeof document === "undefined") return;
  visibilityBound = true;
  document.addEventListener("visibilitychange", () => {
    // Về lại tab: cập nhật NGAY (heartbeat có thể vừa hết hạn lúc tab ẩn).
    if (!document.hidden) broadcastNow();
  });
}

/** Trạng thái bot tổng thể + thông tin chủ bot (bot tự đồng bộ 24/7 từ Discord). */
export function useBotStatus(): BotStatus | null {
  // botStatus giờ khai báo args (botKey tùy chọn cho script chẩn đoán) — truyền
  // object rỗng từ web; hoặc bỏ qua args nhưng useQuery cần đối số đầy đủ.
  const data = useQuery(api.status.botStatus, {});
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    bindVisibilityResync();
    nowListeners.add(setNow);
    startSharedTicker();
    return () => {
      nowListeners.delete(setNow);
      stopSharedTickerIfIdle();
    };
  }, []);
  if (data === undefined) return null;
  return {
    online: !!data.online && isHeartbeatFresh(data.lastHeartbeat, now),
    guildCount: data.guildCount ?? 0,
    memberCount: data.memberCount ?? 0,
    lastHeartbeat: data.lastHeartbeat ?? null,
    ownerName: data.ownerName ?? null,
    ownerAvatarUrl: data.ownerAvatarUrl ?? null,
    hostHealth: data.hostHealth ?? null,
  };
}
