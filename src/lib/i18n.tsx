import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { EN } from "./i18n.en";
import { EN_PANELS } from "./i18n.en.panels";
import { EN_LABELS } from "./i18n.en.labels";
import { DE } from "./i18n.de";
import { DE_PANELS } from "./i18n.de.panels";
import { DE_LABELS } from "./i18n.de.labels";
import { resolveConvexUrl } from "./convexUrl";

/**
 * Đa ngôn ngữ kiểu gettext: chuỗi tiếng Việt trong code là KEY —
 * `t("Đăng nhập")` trả bản dịch của ngôn ngữ đang chọn; không có bản dịch
 * thì rơi về EN, vẫn thiếu nữa mới rơi về nguyên chuỗi VI (không vỡ UI).
 * Script scripts/check-i18n.cjs chặn mọi key có bản EN mà thiếu bản DE.
 */
export type Lang = "vi" | "en" | "de";

/** Từ điển EN: đợt 1 (i18n.en.ts) + panel (i18n.en.panels.ts) + nhãn dữ liệu (i18n.en.labels.ts). */
const DICTS: Record<Exclude<Lang, "vi">, Record<string, string>> = {
  en: { ...EN, ...EN_PANELS, ...EN_LABELS },
  de: { ...DE, ...DE_PANELS, ...DE_LABELS },
};

/** Bản dịch của ngôn ngữ `l` (vi = chính key VI). Dùng bởi check/test. */
export function dictForLang(l: Exclude<Lang, "vi">): Record<string, string> {
  return DICTS[l];
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
    const url = resolveConvexUrl();
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

/** Thay {ten} bằng giá trị biến — kiểu gettext format, không cần lib ngoài. */
function formatVars(s: string, vars?: Record<string, string | number>): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, name) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : m,
  );
}

/** Dịch một chuỗi VI sang ngôn ngữ hiện tại (ngoài React — ưu tiên dùng useT). */
export function translate(s: string, vars?: Record<string, string | number>): string {
  if (currentLang === "vi") return formatVars(s, vars);
  return formatVars(DICTS[currentLang][s] ?? s, vars);
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
    detectLangByIp().then((detected) => {
      if (!alive || !detected) return;
      currentLang = detected;
      setLangState(detected);
    });
    return () => {
      alive = false;
    };
  }, []);

  const setLang = useCallback((l: Lang) => {
    currentLang = l;
    try {
      localStorage.setItem(LANG_KEY, l);
    } catch {
      // localStorage chặn (private mode) — vẫn đổi cho phiên hiện tại.
    }
    setLangState(l);
  }, []);

  // Cập nhật attribute lang của <html> — trình duyệt đọc màn hình + font phụ thuộc.
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const t = useCallback(
    (s: string, vars?: Record<string, string | number>) => {
      if (lang === "vi") return formatVars(s, vars);
      return formatVars(DICTS[lang][s] ?? s, vars);
    },
    [lang],
  );
  const value = useMemo(() => ({ lang, setLang, t, dateLocale }), [lang, setLang, t]);

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

/** Hook dịch trong component — UI tự cập nhật ngay khi người dùng đổi ngôn ngữ. */
export function useT(): LangContextValue {
  return useContext(LangContext);
}
