import { DE } from "./i18n.de";
import { DE_PANELS } from "./i18n.de.panels";
import { DE_LABELS } from "./i18n.de.labels";

/**
 * Từ điển DE gộp 3 file (đợt 1 + panel + nhãn dữ liệu; file sau đè file trước).
 * Nằm ở chunk riêng — i18n.tsx nạp lười khi người dùng dùng tiếng Đức.
 */
const dict: Record<string, string> = { ...DE, ...DE_PANELS, ...DE_LABELS };

export default dict;
