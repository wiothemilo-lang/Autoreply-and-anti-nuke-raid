/**
 * Thống kê sự cố cho trang Sự cố (đợt #4, nâng cấp UI phần A4).
 *
 * Vì sao tách ra khỏi component: đây là phép tính cần test — gom theo ngày và
 * so sánh hai kỳ 14 ngày là chỗ dễ sai lệch (mốc chốt kỳ, sự kiện rơi vào
 * ranh giới đêm). Hàm thuần thì test gọi thẳng được, không cần dựng DOM.
 *
 * LƯU Ý TRUNG THỰC VỀ ĐỘ CHÍNH XÁC: query `incidents.listForGuild` chỉ lấy tối
 * đa 500 sự kiện mỗi nguồn trong 14 ngày. Nên phần "so sánh kỳ trước" là ƯỚC
 * LƯỢNG trên dữ liệu bot còn giữ, không phải thống kê đầy đủ — giao diện phải
 * nói rõ, nếu không chủ server sẽ tưởng server sạch hơn thực tế vì dữ liệu bị
 * cắt.
 */

export interface IncidentLike {
  key: string;
  module: string;
  firstAt: number;
  lastAt: number;
  events: number;
  blocked: number;
  resolved: boolean;
  /** Có mặt để phép tính KHÔNG phụ thuộc payload đầy đủ; không dùng ở đây. */
  kind: string;
  action: string;
  punish: string | null;
  executors: { id: string; name?: string | null }[];
  targets: { id?: string; name?: string | null }[];
}

export interface DayBucket {
  /** Khoá ngày dạng `YYYY-MM-DD` (theo giờ máy người dùng). */
  key: string;
  label: string;
  items: IncidentLike[];
}

export interface PeriodTotals {
  incidents: number;
  blocked: number;
  events: number;
  resolved: number;
}

export interface PeriodComparison {
  current: PeriodTotals;
  previous: PeriodTotals;
  /** Chênh lệch (current − previous); dương = kỳ này nhiều hơn (tệ hơn). */
  delta: PeriodTotals;
  days: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function emptyTotals(): PeriodTotals {
  return { incidents: 0, blocked: 0, events: 0, resolved: 0 };
}

function add(t: PeriodTotals, inc: IncidentLike): void {
  t.incidents += 1;
  t.blocked += inc.blocked;
  t.events += inc.events;
  if (inc.resolved) t.resolved += 1;
}

/** Khoá ngày theo giờ máy — người xem tự thấy đúng ngày mình đang sống. */
function dayKey(ts: number): string {
  const d = new Date(ts);
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * Gom sự cố theo ngày, ngày mới nhất trước (đúng thứ người dùng muốn thấy:
 * chuyện vừa xảy ra ở trên cùng).
 *
 * `locale` để nhãn ngày bám ngôn ngữ đang dùng; để trống thì dùng định dạng
 * mặc định của máy.
 */
export function groupIncidentsByDay(
  incidents: IncidentLike[],
  locale?: string,
  todayTs = Date.now(),
): DayBucket[] {
  const buckets = new Map<string, IncidentLike[]>();
  for (const inc of incidents) {
    const k = dayKey(inc.lastAt || inc.firstAt);
    const arr = buckets.get(k);
    if (arr) arr.push(inc);
    else buckets.set(k, [inc]);
  }
  const todayKey = dayKey(todayTs);
  return [...buckets.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([key, items]) => ({
      key,
      items: [...items].sort((a, b) => (b.lastAt || b.firstAt) - (a.lastAt || a.firstAt)),
      label: key === todayKey ? "Hôm nay" : formatDayLabel(key, locale),
    }));
}

function formatDayLabel(key: string, locale?: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return locale
    ? date.toLocaleDateString(locale, { day: "2-digit", month: "2-digit", year: "numeric" })
    : date.toLocaleDateString();
}

/**
 * So kỳ `days` gần nhất với kỳ `days` ngay trước đó.
 *
 * Mốc chốt lấy theo `lastAt` (mốc cuối của sự cố): sự cố kéo dài qua đêm thì
 * tính vào ngày nó kết thúc — đúng như cách người ta đọc danh sách này.
 */
export function compareIncidentPeriods(
  incidents: IncidentLike[],
  now = Date.now(),
  days = 14,
): PeriodComparison {
  const span = days * DAY_MS;
  const current = emptyTotals();
  const previous = emptyTotals();
  for (const inc of incidents) {
    const ts = inc.lastAt || inc.firstAt;
    if (ts >= now - span) add(current, inc);
    else if (ts >= now - 2 * span) add(previous, inc);
  }
  return {
    current,
    previous,
    delta: {
      incidents: current.incidents - previous.incidents,
      blocked: current.blocked - previous.blocked,
      events: current.events - previous.events,
      resolved: current.resolved - previous.resolved,
    },
    days,
  };
}

/** Sự cố theo module, giảm dần — dùng để biết loại nào bị nhiều nhất. */
export function summarizeByModule(incidents: IncidentLike[]): {
  module: string;
  incidents: number;
  blocked: number;
}[] {
  const map = new Map<string, { incidents: number; blocked: number }>();
  for (const inc of incidents) {
    const cur = map.get(inc.module) ?? { incidents: 0, blocked: 0 };
    cur.incidents += 1;
    cur.blocked += inc.blocked;
    map.set(inc.module, cur);
  }
  return [...map.entries()]
    .map(([module, v]) => ({ module, ...v }))
    .sort((a, b) => b.incidents - a.incidents || a.module.localeCompare(b.module));
}
