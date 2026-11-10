import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBotStatus, type BotStatus } from "./useBotStatus";
import { dateLocale } from "./i18n";
import { convexPingUrl } from "./convexUrl";
import { BOT_SYNC_INTERVAL_MS } from "./utils";

/**
 * URL ping — TÍNH LÚC CẦN, không gọi `convexPingUrl()` ở top-level.
 *
 * Vì sao: `convexPingUrl()` ném ngay khi env sai/mất, và ở top-level thì cả
 * MODULE không import được — kể cả trong script test (`import.meta.env.DEV`
 * luôn false ngoài Vite). Điều đó làm các hàm thuần cùng file
 * (`latencyLabel`, `fmtVietnam`) không test được.
 *
 * Không mất gì về fail-closed: chỗ chặn đúng là bootstrap `src/main.tsx`
 * (`resolveConvexUrl()` ném trước khi React mount — xem comment ở file đó).
 * Ở đây chỉ cần đừng chặn việc import; lỗi env sẽ nổi lên ở lần ping đầu
 * và vào danh sách sự cố như mọi lỗi kết nối khác.
 */
let pingUrl: string | null = null;
function pingEndpoint(): string {
  pingUrl ??= convexPingUrl();
  return pingUrl;
}

export const LATENCY_FAST = 300;
export const LATENCY_SLOW = 800;
export const INCIDENT_SLOW = 1200;
/**
 * Nhịp bot đẩy dữ liệu lên Convex: 180s (`setTimeout(runSyncLoop, 180_000)`
 * trong bot/src/index.js), lấy từ hằng số dùng chung ở lib/utils.ts.
 *
 * Trước đây khai 60s ở đây → khung "Cập nhật tiếp theo" luôn hiện một mốc đã
 * trôi qua và dòng chú thích ghi "mỗi 60 giây" trong khi bot thật sự 180s —
 * người dùng nhìn mốc cũ rồi tưởng bot đứng.
 */
export const SYNC_INTERVAL_MS = BOT_SYNC_INTERVAL_MS;

interface MonitorIncident {
  time: number;
  text: string;
}

export function latencyLabel(ms: number): { label: string; cls: string } {
  // Đen-trắng: trạng thái đọc qua chữ + độ đậm, không màu (trừ đỏ lỗi thật).
  if (ms < LATENCY_FAST) return { label: "Nhanh", cls: "text-foreground font-medium" };
  if (ms < LATENCY_SLOW) return { label: "Trung bình", cls: "text-muted-foreground" };
  return { label: "Chậm", cls: "text-destructive" };
}

/** Định dạng mốc thời gian theo giờ Việt Nam (UTC+7). */
export function fmtVietnam(ts: number): string {
  return new Date(ts).toLocaleString(dateLocale(), {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

async function pingBackend(): Promise<number> {
  const t0 = performance.now();
  const res = await fetch(pingEndpoint(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: "status:botStatus", format: "json", args: {} }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  await res.json();
  return Math.round(performance.now() - t0);
}

/** Kết quả ping backend gần nhất — nguồn tin của thẻ "Backend (dữ liệu)". */
export interface BackendPing {
  state: "ok" | "down" | "checking";
}

export interface BotMonitor {
  status: BotStatus | null;
  latency: number | null;
  history: number[];
  avg: number | null;
  incidents: MonitorIncident[];
  lastUpdate: number | null;
  nextUpdate: number | null;
  refresh: () => void;
  /** Kết quả ping HTTP gần nhất — KHÁC subscription: ping lỗi là backend thật sự không gọi được. */
  backendPing: BackendPing;
}

/**
 * Giám sát bot dùng chung (trang Monitor + cửa sổ Admin): trạng thái phản ứng,
 * đo độ trễ thật, nhật ký sự cố, và khung giờ cập nhật theo giờ VN.
 *
 * TỐI ƯU USAGE (Convex free 1M calls/tháng): status dùng SUBSCRIPTION reactive
 * (useBotStatus — 0 call khi dữ liệu không đổi); riêng vòng đo latency dùng
 * HTTP POST mù và là call thật ⇒ giãn tối thiểu 30s (một tab mở 24/7 chỉ còn
 * ~43k calls/tháng), tab ẩn thì dừng hẳn vòng đo.
 */
export function useBotMonitor(intervalMs = 5000, enabled = true): BotMonitor {
  const status = useBotStatus(enabled);
  const [latency, setLatency] = useState<number | null>(null);
  const [history, setHistory] = useState<number[]>([]);
  const [incidents, setIncidents] = useState<MonitorIncident[]>([]);
  const [backendPing, setBackendPing] = useState<BackendPing>({ state: "checking" });
  const [nonce, setNonce] = useState(0);
  const timerRef = useRef<number>(0);

  // Chu kỳ đo latency tối thiểu 30s (đủ mượt cho biểu đồ — status vẫn realtime
  // qua subscription). Trước đây 5-15s ⇒ một tab mở 24/7 đốt tới 518k calls/tháng.
  const effectiveInterval = useMemo(() => Math.max(intervalMs, 30_000), [intervalMs]);

  const tick = useCallback(async () => {
    try {
      const ms = await pingBackend();
      setLatency(ms);
      setBackendPing({ state: "ok" });
      setHistory((h) => [...h.slice(-29), ms]);
      if (ms > INCIDENT_SLOW) {
        setIncidents((arr) =>
          [{ time: Date.now(), text: `Độ trễ cao: ${ms} ms` }, ...arr].slice(0, 10),
        );
      }
    } catch {
      setLatency(null);
      setBackendPing({ state: "down" });
      setIncidents((arr) =>
        [{ time: Date.now(), text: "Mất kết nối tới máy chủ" }, ...arr].slice(0, 10),
      );
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    // LUÔN đăng ký listener TRƯỚC khi kiểm document.hidden. Bản cũ return sớm
    // khi mount lúc tab ẩn → không có listener → hiện lại tab cũng không resume
    // (latency kẹt null). Đồng thời guard cả trong callback interval để một
    // visibilitychange bị lỡ không làm poll tiếp khi tab ẩn.
    const start = () => {
      window.clearInterval(timerRef.current);
      if (document.hidden) return;
      void tick();
      timerRef.current = window.setInterval(() => {
        if (!document.hidden) void tick();
      }, effectiveInterval);
    };
    start();
    document.addEventListener("visibilitychange", start);
    return () => {
      window.clearInterval(timerRef.current);
      document.removeEventListener("visibilitychange", start);
    };
  }, [tick, effectiveInterval, nonce, enabled]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  const avg =
    history.length > 0 ? Math.round(history.reduce((a, b) => a + b, 0) / history.length) : null;

  const lastUpdate = status?.lastHeartbeat ?? null;
  const nextUpdate = lastUpdate !== null ? lastUpdate + SYNC_INTERVAL_MS : null;

  return {
    status,
    latency,
    history,
    avg,
    incidents,
    lastUpdate,
    nextUpdate,
    refresh,
    backendPing,
  };
}
