import { EN } from "./i18n.en";
import { EN_PANELS } from "./i18n.en.panels";
import { EN_LABELS } from "./i18n.en.labels";

/**
 * Từ điển EN gộp 3 file (đợt 1 + panel + nhãn dữ liệu; file sau đè file trước).
 * Nằm ở chunk riêng — i18n.tsx nạp lười khi người dùng dùng tiếng Anh.
 */
const dict: Record<string, string> = { ...EN, ...EN_PANELS, ...EN_LABELS };

export default dict;
