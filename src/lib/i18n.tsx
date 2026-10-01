import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { convexSiteUrl } from "./convexUrl";

/**
 * Đa ngôn ngữ kiểu gettext: chuỗi tiếng Việt trong code là KEY —
 * `t("Đăng nhập")` trả bản dịch của ngôn ngữ đang chọn; không có bản dịch
 * thì rơi về nguyên chuỗi VI (không vỡ UI).
 * Script scripts/check-i18n.cjs chặn mọi key có bản EN mà thiếu bản DE.
 */
export type Lang = "vi" | "en" | "de";
type DictLang = Exclude<Lang, "vi">;
type Dict = Record<string, string>;

/**
 * Từ điển EN/DE nạp LƯỜI, mỗi ngôn ngữ một chunk (gộp 3 file ở i18n.dict.<lang>.ts).
 * Đo 30/09/2026: hai từ điển chiếm ~404 KB / 509 KB chunk entry, nên người dùng
 * tiếng Việt — không cần bản dịch nào vì VI chính là key — vẫn tải cả hai.
 */
const LOADERS: Record<DictLang, () => Promise<{ default: Dict }>> = {
  en: () => import("./i18n.dict.en"),
  de: () => import("./i18n.dict.de"),
};
const loaded: Partial<Record<DictLang, Dict>> = {};
const pending: Partial<Record<DictLang, Promise<boolean>>> = {};
const dictListeners = new Set<() => void>();

/**
 * Bảo đảm từ điển của `l` đã nạp. KHÔNG bao giờ reject: lỗi mạng hoặc chunk đã bị
 * xoá sau deploy trả false và không cache thất bại (lần gọi sau thử lại);
 * translate() rơi về chuỗi VI như khi thiếu bản dịch. Gọi đồng thời dùng chung promise.
 */
export function ensureDictionary(l: Lang): Promise<boolean> {
  if (l === "vi" || loaded[l]) return Promise.resolve(true);
  const inflight = pending[l];
  if (inflight) return inflight;
  const p = LOADERS[l]().then(
    (m) => {
      loaded[l] = m.default;
      delete pending[l];
      dictListeners.forEach((fn) => fn());
      return true;
    },
    (err: unknown) => {
      delete pending[l];
      console.warn(`[i18n] không tải được từ điển ${l}:`, err);
      return false;
    },
  );
  pending[l] = p;
  return p;
}

/** Bản dịch của `s` ở ngôn ngữ `l` nếu từ điển đã nạp và có key; không thì null (→ dùng chính chuỗi VI). */
export function lookupTranslation(l: Lang, s: string): string | null {
  if (l === "vi") return null;
  return loaded[l]?.[s] ?? null;
}

const LANG_KEY = "protogon-lang";
const LANGS: Lang[] = ["vi", "en", "de"];

function readInitialLang(): Lang {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved && (LANGS as string[]).includes(saved)) return saved as Lang;
    // Không có lựa chọn lưu: theo ngôn ngữ trình duyệt, mặc định VI (sản phẩm gốc).
    const nav = navigator.language?.toLowerCase() ?? "";
    if (nav === "") return "vi";
    if (nav.startsWith("de")) return "de";
    return nav.startsWith("vi") ? "vi" : "en";
  } catch {
    return "vi";
  }
}

/**
 * Dò quốc gia theo IP qua endpoint Convex `/geo_lang` (convex/http.ts — CSP
 * connect-src chỉ cho *.convex.cloud nên phải proxy qua đây). Chạy MỘT LẦN khi
 * người dùng CHƯA có lựa chọn ngôn ngữ lưu: người VN mở web thấy tiếng Việt,
 * người DE thấy tiếng Đức kể cả khi trình duyệt đang tiếng Anh — điều mà
 * navigator.language không làm được. KHÔNG persist: chỉ áp dụng cho phiên;
 * người dùng bấm công tắc ngôn ngữ thì setLang() mới ghi localStorage.
 * Trả null khi không dò được (lỗi mạng, ngôn ngữ không hỗ trợ) → giữ nguyên.
 */
export async function detectLangByIp(): Promise<Lang | null> {
  try {
    // HTTP actions phục vụ ở .convex.site (KHÔNG phải .convex.cloud — bug 26/09).
    const url = convexSiteUrl();
    const res = await fetch(`${url}/geo_lang`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    const country =
      typeof data === "object" && data !== null && "country" in data
        ? String((data as { country: unknown }).country ?? "").toUpperCase()
        : "";
    if (country === "VN") return "vi";
    if (country === "DE" || country === "AT" || country === "CH" || country === "LI") return "de";
    return null;
  } catch {
    return null;
  }
}

/** Ngôn ngữ hiện tại ở cấp module — dùng cho helper ngoài React (format ngày…). */
let currentLang: Lang = typeof window === "undefined" ? "vi" : readInitialLang();
// Bắt đầu tải từ điển ngay lúc nạp module (song song với React/Convex khởi tạo)
// thay vì chờ tới lần vẽ đầu.
if (currentLang !== "vi") void ensureDictionary(currentLang);

/**
 * Chờ từ điển của ngôn ngữ ban đầu (tối đa `timeoutMs`) để lần vẽ đầu đã đúng
 * ngôn ngữ, không nháy tiếng Việt. Quá hạn thì vẽ luôn; từ điển tới muộn làm
 * LangProvider vẽ lại. Tiếng Việt không cần chờ gì.
 */
export async function prepareInitialLanguage(timeoutMs = 4000): Promise<void> {
  if (currentLang === "vi") return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, timeoutMs);
  });
  await Promise.race([ensureDictionary(currentLang), timeout]);
  clearTimeout(timer);
}

/** Thay {ten} bằng giá trị biến — kiểu gettext format, không cần lib ngoài. */
function formatVars(s: string, vars?: Record<string, string | number>): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, name) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : m,
  );
}

/** Dịch một chuỗi VI sang ngôn ngữ hiện tại (ngoài React — ưu tiên dùng useT). */
export function translate(s: string, vars?: Record<string, string | number>): string {
  return formatVars(lookupTranslation(currentLang, s) ?? s, vars);
}

/** Ngôn ngữ hiện tại — dùng khi cần gửi lựa chọn lên backend (ví dụ AI). */
export function currentLanguage(): Lang {
  return currentLang;
}

/** Locale cho toLocaleString/toLocaleTimeString theo ngôn ngữ hiện tại. */
export function dateLocale(): string {
  return currentLang === "vi" ? "vi-VN" : currentLang === "de" ? "de-DE" : "en-US";
}

interface LangContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  /** Dịch chuỗi VI (key) — component dùng hook này để tự re-render khi đổi ngôn ngữ.
   *  Hỗ trợ biến {ten}: t("Đã lưu {n} rule", { n }). */
  t: (s: string, vars?: Record<string, string | number>) => string;
  dateLocale: () => string;
}

const LangContext = createContext<LangContextValue>({
  lang: "vi",
  setLang: () => {},
  t: (s) => s,
  dateLocale: () => "vi-VN",
});

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(currentLang);
  const [dictVersion, setDictVersion] = useState(0);
  // Mỗi lần người dùng bấm công tắc tăng một vé: chỉ lần bấm CUỐI được áp dụng,
  // và lựa chọn thủ công luôn thắng kết quả dò IP chạy chậm hơn.
  const ticket = useRef(0);

  // Từ điển tới muộn (quá hạn prepareInitialLanguage, hoặc thử lại sau lỗi) →
  // vẽ lại để chuỗi được dịch.
  useEffect(() => {
    const bump = () => setDictVersion((v) => v + 1);
    dictListeners.add(bump);
    return () => {
      dictListeners.delete(bump);
    };
  }, []);

  // IP-detect CHỈ khi chưa có lựa chọn lưu (điều kiện theo currentLang đồng
  // bộ vì readInitialLang đã đọc localStorage). setLangInMemory = không ghi
  // localStorage — lần sau vào vẫn dò lại, tới khi người dùng tự chọn.
  useEffect(() => {
    let alive = true;
    const saved = (() => {
      try {
        return localStorage.getItem(LANG_KEY);
      } catch {
        // localStorage chặn (private mode) — coi như chưa có lựa chọn lưu:
        // vẫn dò theo IP (không persist được cũng không sao).
        return null;
      }
    })();
    if (saved) return;
    const startedAt = ticket.current;
    detectLangByIp().then((detected) => {
      if (!alive || !detected || ticket.current !== startedAt) return;
      void ensureDictionary(detected).then(() => {
        if (!alive || ticket.current !== startedAt) return;
        currentLang = detected;
        setLangState(detected);
      });
    });
    return () => {
      alive = false;
    };
  }, []);

  const setLang = useCallback((l: Lang) => {
    try {
      localStorage.setItem(LANG_KEY, l);
    } catch {
      // localStorage chặn (private mode) — vẫn đổi cho phiên hiện tại.
    }
    const mine = ++ticket.current;
    // Đổi ngôn ngữ SAU khi từ điển sẵn sàng để UI không nháy tiếng Việt. Nạp lỗi
    // vẫn đổi (chuỗi rơi về VI) và lần bấm sau thử nạp lại.
    void ensureDictionary(l).then(() => {
      if (mine !== ticket.current) return;
      currentLang = l;
      setLangState(l);
    });
  }, []);

  // Cập nhật attribute lang của <html> — trình duyệt đọc màn hình + font phụ thuộc.
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const t = useCallback(
    (s: string, vars?: Record<string, string | number>) =>
      formatVars(lookupTranslation(lang, s) ?? s, vars),
    // dictVersion đổi khi từ điển vừa nạp xong → t() đổi identity để consumer vẽ lại.
    [lang, dictVersion],
  );
  const value = useMemo(() => ({ lang, setLang, t, dateLocale }), [lang, setLang, t]);

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

/** Hook dịch trong component — UI tự cập nhật ngay khi người dùng đổi ngôn ngữ. */
export function useT(): LangContextValue {
  return useContext(LangContext);
}
