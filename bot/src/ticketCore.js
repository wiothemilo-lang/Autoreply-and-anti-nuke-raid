"use strict";
/**
 * ticketCore.js — HÀM THUẦN của tính năng ticket (khiếu nại + hỗ trợ chung).
 *
 * Vì sao tách file: phần tạo kênh / bấm nút phải cần `discord.js` và gateway,
 * nên không test được hermetic. Mọi quyết định THUẦN — tên kênh hợp lệ, có
 * được mở ticket không, cắt/escape nội dung người dùng, dựng payload embed —
 * nằm ở đây để `scripts/test-tickets.cjs` chạy không cần mạng, không cần mock
 * Discord. Đúng kiểu `convex/guildConfig.ts` tách hàm thuần khỏi phần gọi db.
 *
 * ⚠️ BẢO MẬT — escapeMentions là hàng rào CHỐNG PING, không phải chi tiết đẹp:
 * nội dung người dùng sẽ được dán vào embed trong kênh ticket. Không escape
 * thì 1 người gõ `@everyone` trong khiếu nại là ping cả server. Vì vậy MỌI
 * đường đi nội dung người dùng vào embed đều bắt buộc qua `escapeMentions`.
 *
 * ⚠️ VÌ SAO MỌI KÝ TỰ ĐẶC BIỆT Ở ĐÂY ĐỀU VIẾT BẰNG ESCAPE `\uXXXX`:
 * ký tự vô hình (U+200B) và dấu thanh tổ hợp (U+0300–U+036F) rất dễ bị
 * editor/sed/tooling nuốt mất — đã xảy ra đúng một lần trong lúc viết file
 * này: hằng `ZERO_WIDTH` thành chuỗi rỗng và `escapeMentions` biến thành hàm
 * NO-OP (tức là mất hoàn toàn hàng rào chống ping). Dùng escape ASCII thì mắt
 * không thấy gì nhưng byte luôn đúng, và test hermetic bắt được ngay.
 */

/** Chữ cái/số được giữ lại trong tên kênh (ASCII, lowercase, và `-` `_`). */
const CHANNEL_NAME_KEEP = /[^a-z0-9_-]+/g;

/** Tên kênh Discord dài tối đa 100 ký tự. */
const CHANNEL_NAME_MAX = 100;

/** Nội dung khiếu nại cắt tối đa 1000 ký tự (giới hạn Discord embed field). */
const BODY_MAX = 1000;

/** Bằng chứng cắt tối đa 500 ký tự. */
const EVIDENCE_MAX = 500;

/** Mặc định khi cấu hình thiếu — SỐ LẺ để lỗi cấu hình không khoá cứng server. */
const DEFAULTS = {
  maxOpen: 20,
  cooldownHours: 24,
};

/** Ký tự zero-width space (U+200B) — viết bằng escape, xem ghi chú đầu file. */
const ZERO_WIDTH = String.fromCharCode(0x200b);

/**
 * Chèn zero-width vào giữa ký hiệu mention để Discord không nhận ra.
 *
 * Vì sao ZWSP chứ không phải backslash: Discord escape bằng `\@` là thứ user
 * tự gõ được, ai cũng bypass được. ZWSP làm "chữ" trong mention, nên text vẫn
 * đọc gần như nguyên vẹn mà không ping ai.
 *
 * Phủ: @everyone, @here, <@id> / <@!id> (mention user), <@&id> (mention role).
 */
function escapeMentions(text) {
  if (text === null || text === undefined) return "";
  return String(text)
    .replace(/@(everyone|here)/g, `@${ZERO_WIDTH}$1`)
    .replace(/<@!?\d+>/g, (m) => `<@${ZERO_WIDTH}${m.slice(2)}`)
    .replace(/<@&\d+>/g, (m) => `<@&${ZERO_WIDTH}${m.slice(3)}`);
}

/** Cắt chuỗi kèm dấu "…" khi bị cắt. */
function clip(text, max) {
  const s = String(text ?? "");
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1))}…`;
}

/**
 * Chuẩn hoá + escape nội dung người dùng trước khi nhét vào embed.
 *
 * Luôn escape (kể cả khi không cắt) — hai việc độc lập, gộp vào một hàm để
 * không ai gọi `clip` mà quên `escapeMentions`.
 */
function sanitizeBody(text, max = BODY_MAX) {
  return clip(escapeMentions(text).trim(), max);
}

/**
 * Bỏ dấu thanh tổ hợp (chuẩn hoá NFD rồi xoá U+0300–U+036F và U+1AB0–U+1AFF).
 *
 * Vì sao cần: tên kênh Discord chỉ nhận `a-z0-9_-`; "khiếu nại" có `ế` là
 * không hợp lệ. Phải NFD TRƯỚC rồi xoá dấu — thứ tự ngược lại sẽ nuốt mất
 * chữ gốc.
 *
 * Ghi chú: `đ`/`Đ` KHÔNG tách được bằng NFD (nó là một chữ riêng U+0110/U+0111
 * chứ không phải base+dấu) → xử lý riêng trong `sanitizeChannelName`.
 */
function stripDiacritics(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f\u1ab0-\u1aff]/g, "");
}

/** Chuẩn hoá tên kênh về đúng luật Discord. */
function sanitizeChannelName(name, max = CHANNEL_NAME_MAX) {
  let out = stripDiacritics(name)
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(CHANNEL_NAME_KEEP, "-")
    .replace(/-+/g, "-") // gộp gạch liên tiếp (Discord từ chối "--")
    .replace(/^[-_]+/, "") // không bắt đầu bằng - hoặc _
    .replace(/[-_]+$/, "") // không kết thúc bằng - hoặc _
    .slice(0, max)
    .replace(/[-_]+$/, ""); // cắt có thể để lại gạch ở cuối → dọn lần nữa
  if (!out) out = "ticket";
  return out;
}

/**
 * Dựng tên kênh từ MẪU của chủ server.
 *
 * Placeholder hỗ trợ: {number} {user} {kind}. Placeholder lạ → bỏ (không
 * để lọt ký tự `{}` vào tên kênh — Discord từ chối).
 *
 * Rỗng → rơi về `buildChannelName` (đúng hành vi cũ: `ticket-<số>`).
 *
 * ⚠️ Mẫu do CHỦ SERVER soạn nên đi qua `sanitizeChannelName` như mọi tên
 * kênh khác: gõ `../../../` hoặc 200 ký tự mới không làm tạo kênh hỏng.
 */
function buildChannelNameFromTemplate({ template, username, number, kind }) {
  const src = String(template ?? "").trim();
  if (!src) return buildChannelName({ username, number });
  const filled = src
    .replace(/\{number\}/g, () => String(number ?? "1"))
    .replace(/\{user\}/g, () => sanitizeChannelName(username || ""))
    .replace(/\{kind\}/g, () => sanitizeChannelName(kind || ""))
    .replace(/\{\w+\}/g, "");
  const out = sanitizeChannelName(filled);
  // Mẫu chỉ chứa ký tự bị loại (vd "@@@") → sanitize rơi về "ticket"; thay bằng
  // tên mặc định có số để kênh vẫn phân biệt được, thay vì 3 kênh trùng tên.
  return out === "ticket" ? buildChannelName({ username, number }) : out;
}

/**
 * Ngân sách tin nhắn của 1 kênh ticket đã vượt chưa.
 *
 * `messageCount` là số tin của CHÍNH kênh đó (không phải cả server): ngân
 * sách bảo vệ kênh, không phải bảo vệ bot. 0 = tắt, nên luôn trả false.
 */
function isBudgetExceeded({ messageCount, budget }) {
  const cap = Math.floor(Number(budget));
  if (!Number.isFinite(cap) || cap <= 0) return false;
  return (Number(messageCount) || 0) >= cap;
}

/** Tên kênh ticket: `ticket-<số>` hoặc `<tên user đã bỏ dấu>-<số>`. */
function buildChannelName({ username, number, prefix = "ticket" }) {
  // KHÔNG dùng fallback "ticket" của sanitizeChannelName làm `who`: nếu
  // username rỗng thì tên ra "ticket-ticket-7" (đã xảy ra, test bắt được).
  // Ở đây chỉ cần biết "có dùng được tên không", nên tự kiểm.
  const raw = String(username ?? "").trim();
  const who = raw ? sanitizeChannelName(raw) : "";
  // Bỏ tiền tố trùng lặp: username đã là "ticket-…" thì không lặp thêm.
  const base = who.startsWith(`${prefix}-`) ? who.slice(prefix.length + 1) : who;
  const tail = String(number ?? "").trim() || "1";
  return sanitizeChannelName(base ? `${prefix}-${base}-${tail}` : `${prefix}-${tail}`);
}

/** Ép số cấu hình về khoảng hợp lệ; rác → `fallback`. */
function normalizeLimit(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

/**
 * Quyết định có cho mở ticket không.
 *
 * @param {object} args
 * @param {boolean} args.enabled       cấu hình ticketEnabled
 * @param {string|null} args.category  ticketCategoryId
 * @param {string[]} args.staffRoleIds role nào được coi là staff
 * @param {number} args.openCount      số ticket `open` của server
 * @param {number|null} args.lastOpenedAt mở lần trước của chính người này
 * @param {number} args.maxOpen        ticketMaxOpen
 * @param {number} args.cooldownHours  ticketCooldownHours
 * @param {number} args.now            inject để test không phụ thuộc Date
 * @returns {{ok: true} | {ok: false, reason: string, waitHours?: number, max?: number}}
 *
 * Thứ tự kiểm tra CỐ Ý: cấu hình → hàng rào chống spam → người dùng. Lý do:
 * người gọi nên thấy "chủ server chưa cấu hình" trước "bạn vừa mở ticket" —
 * lỗi cấu hình là lỗi chủ server, không phải lỗi người dùng.
 */
function decideOpen({
  enabled,
  category,
  staffRoleIds = [],
  openCount = 0,
  lastOpenedAt = null,
  maxOpen = DEFAULTS.maxOpen,
  cooldownHours = DEFAULTS.cooldownHours,
  now = Date.now(),
}) {
  if (!enabled) return { ok: false, reason: "disabled" };
  if (!category) return { ok: false, reason: "no_category" };
  if (!Array.isArray(staffRoleIds) || staffRoleIds.length === 0) {
    return { ok: false, reason: "no_staff" };
  }
  const cap = normalizeLimit(maxOpen, DEFAULTS.maxOpen, 1, 100);
  const cool = normalizeLimit(cooldownHours, DEFAULTS.cooldownHours, 0, 720);
  if (openCount >= cap) return { ok: false, reason: "max_open", max: cap };
  if (cool > 0 && lastOpenedAt) {
    const elapsedHours = (now - lastOpenedAt) / 3_600_000;
    if (elapsedHours < cool) {
      return { ok: false, reason: "cooldown", waitHours: Math.ceil(cool - elapsedHours) };
    }
  }
  return { ok: true };
}

/* ══════════════════════════════════════════════════════════════════════
   LOẠI TICKET TUỲ CHỈNH (29/09/2026)
   ══════════════════════════════════════════════════════════════════════
   Trước đây chỉ có 2 loại CỨNG `support` | `appeal`. Nay chủ server tự
   định nghĩa danh sách loại trên dashboard (bảng `ticketKinds`). Mọi hàm
   dưới đây là HÀM THUẦN nhận danh sách loại → trả về danh sách đã chuẩn hoá,
   nên test hermetic được không cần Discord.

   ⚠️ NGUYÊN TẮC TƯƠNG THÍCH NGƯỢC: danh sách rác/rỗng → `defaultTicketKinds()`
   (đúng 2 loại cũ). Server chưa cấu hình gì thì hành vi Y HỆT trước đây. */

/** Trần số loại (khớp MAX_KINDS bên Convex). Discord: 5 nút/hàng × 5 hàng. */
const MAX_TICKET_KINDS = 10;

/** Trần của Discord — vượt thì API ném lỗi, hỏng CẢ panel. */
const KIND_LABEL_MAX = 80;
const KIND_MODAL_LABEL_MAX = 45;
const KIND_PLACEHOLDER_MAX = 100;
const KIND_DESC_MAX = 120;

/**
 * Trần ô nhập BỔ SUNG mỗi loại (khớp MAX_EXTRA_FIELDS bên Convex).
 *
 * 3 chứ không phải 5: Discord chỉ nhận 5 input 1 modal, 2 ô cố định
 * (nội dung + bằng chứng) đã chiếm 2 chỗ. 7 input là API TỪ CHỐI toàn bộ
 * modal → người dùng bấm nút xong không thấy gì cả.
 */
const MAX_KIND_EXTRA_FIELDS = 3;

/** Trần value của ô bổ sung (khớp cắt ở bot_writes:botOpenTicket). */
const EXTRA_VALUE_MAX = 300;

/**
 * 2 loại CỨNG — dùng khi server chưa cấu hình loại tuỳ chỉnh.
 *
 * `T` ở đây là BẢNG CHUỖI ĐÃ DỊCH, không phải tên: chuỗi được dùng làm nhãn
 * nút và nhãn ô nhập. Rỗng → rơi về tiếng Việt để test/log vẫn đọc được.
 */
function defaultTicketKinds(T = {}) {
  return [
    {
      key: "support",
      label: T.openSupport || "Hỗ trợ chung",
      description: "",
      emoji: "",
      color: "",
      question: T.openBodyLabelSupport || "",
      questionPlaceholder: T.openBodyPlaceholderSupport || "",
      evidenceQuestion: T.openEvidenceLabel || "",
      staffRoleIds: [],
      fields: [],
    },
    {
      key: "appeal",
      label: T.openAppeal || "Khiếu nại hình phạt",
      description: "",
      emoji: "",
      color: "",
      question: T.modalAppealLabel || "",
      questionPlaceholder: "",
      evidenceQuestion: T.modalEvidenceLabel || T.openEvidenceLabel || "",
      staffRoleIds: [],
      fields: [],
    },
  ];
}

/** Bỏ khoảng trắng thừa + cắt theo trần; rỗng → undefined. */
function clipField(value, max) {
  const out = String(value ?? "")
    .trim()
    .slice(0, max);
  return out || undefined;
}

/**
 * Chuẩn hoá DANH SÁCH loại từ cấu hình.
 *
 * Phòng thủ ở đây chứ không phó bot xử lý từng lỗi: cấu hình do dashboard ghi
 * nhưng vẫn có thể lệch (server cũ, migration, nhập tay). Mỗi loại rác bị BỎ
 * QUA chứ không làm hỏng cả danh sách — 1 loại sai không được giết panel.
 *
 * @param {Array} raw  danh sách từ `getBotConfig.ticketKinds`
 * @param {object} T   bảng chuỗi đã dịch (dùng cho loại mặc định)
 * @returns {Array} danh sách loại đã chuẩn hoá, ≥ 1 phần tử
 */
function normalizeKinds(raw, T = {}) {
  const list = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();
  for (const item of list) {
    if (out.length >= MAX_TICKET_KINDS) break;
    if (!item || typeof item !== "object") continue;
    const key = String(item.key ?? "").trim();
    // Khoá rác → bỏ. `seen` chặn trùng: trùng key thì 2 nút có cùng customId →
    // bấm nút nào cũng mở loại đầu tiên, loại còn lại không bao giờ dùng.
    if (!/^[a-z0-9_-]{1,32}$/.test(key) || seen.has(key)) continue;
    const label = clipField(item.label, KIND_LABEL_MAX);
    // Không có nhãn thì bỏ: nút Discord không có nhãn sẽ trông như nút vô
    // nghĩa và chủ server không phân biệt được loại nào là loại nào.
    if (!label) continue;
    seen.add(key);
    const staff = Array.isArray(item.staffRoleIds) ? item.staffRoleIds : [];
    out.push({
      key,
      label,
      description: clipField(item.description, KIND_DESC_MAX) ?? "",
      emoji: clipField(item.emoji, 40) ?? "",
      color: clipField(item.color, 7) ?? "",
      question: clipField(item.question, KIND_MODAL_LABEL_MAX),
      questionPlaceholder: clipField(item.questionPlaceholder, KIND_PLACEHOLDER_MAX),
      evidenceQuestion: clipField(item.evidenceQuestion, KIND_MODAL_LABEL_MAX),
      staffRoleIds: [...new Set(staff.map((r) => String(r ?? "").trim()).filter(Boolean))].slice(
        0,
        5,
      ),
      fields: normalizeExtraFields(item.fields),
    });
  }
  return out.length > 0 ? out : defaultTicketKinds(T);
}

/** Tìm loại theo khoá; không thấy → `null` (KHÔNG tự rơi về loại đầu). */
function findKind(kinds, key) {
  const list = Array.isArray(kinds) ? kinds : [];
  const k = String(key ?? "").trim();
  return list.find((x) => x && x.key === k) ?? null;
}

/**
 * Chuẩn hoá giá trị người dùng bấm nút / lệnh thành 1 key trong danh sách loại.
 *
 * Danh sách rỗng → `normalizeKinds` đã trả 2 loại cũ, nên "giá trị lạ → loại
 * đầu tiên" là hành vi CŨ (loại đầu là `support`).
 */
function normalizeKind(kind, kinds) {
  const list = Array.isArray(kinds) && kinds.length > 0 ? kinds : defaultTicketKinds();
  return findKind(list, kind) ? String(kind) : list[0].key;
}

/**
 * Role nào xử lý loại ticket này.
 *
 * Ưu tiên role RIÊNG của loại; rỗng thì rơi về `fallback` (role staff chung
 * của server) — cùng quy tắc `staffRoleIds(config)` đã dùng từ trước.
 */
function staffRoleIdsForKind(kinds, key, fallback = []) {
  const kind = findKind(kinds, key);
  if (kind && kind.staffRoleIds.length > 0) return kind.staffRoleIds;
  return Array.isArray(fallback) ? fallback : [];
}

/** Emoji dùng được cho `ButtonBuilder.setEmoji`: Unicode ngắn hoặc `<a:t:id>`. */
function isUsableEmoji(emoji) {
  const s = String(emoji ?? "").trim();
  if (!s) return false;
  if (/^<a?:\w{2,32}:\d{15,25}>$/.test(s)) return true;
  return [...s].length <= 2;
}

/**
 * Chuẩn hoá các ô nhập BỔ SUNG của một loại.
 *
 * Rác bị BỎ QUA chứ không làm hỏng modal: ô thiếu nhãn hoặc khoá sai định
 * dạng thì bỏ ô đó, giữ lại phần còn lại. 1 ô sai không được giết cả
 * đường mở ticket.
 *
 * Khoá trùng 2 ô cố định (`ticket_body` / `ticket_evidence`) cũng bị bỏ:
 * chúng đã chiếm chỗ trong modal, trùng customId là Discord ném lỗi.
 */
function normalizeExtraFields(raw) {
  const out = [];
  const seen = new Set(["ticket_body", "ticket_evidence"]);
  for (const f of Array.isArray(raw) ? raw : []) {
    if (out.length >= MAX_KIND_EXTRA_FIELDS) break;
    const key = String(f?.key ?? "")
      .trim()
      .toLowerCase();
    const label = clipField(f?.label, KIND_MODAL_LABEL_MAX);
    if (!/^[a-z0-9_-]{1,32}$/.test(key) || !label || seen.has(key)) continue;
    seen.add(key);
    out.push({
      key,
      label,
      placeholder: clipField(f?.placeholder, KIND_PLACEHOLDER_MAX),
      // Bắt buộc mặc định FALSE: ô bổ sung bắt buộc mà người dùng không
      // biết điền là họ bấm "Gửi" rồi bị từ chối, thường hơn nhiều so với
      // việc họ bỏ trống 1 ô phụ.
      required: f?.required === true,
      long: f?.long === true,
    });
  }
  return out;
}

/**
 * Dựng bộ nút panel MỞ ticket từ danh sách loại — TRẢ OBJECT THUẦN.
 *
 * Vì sao không dựng `ButtonBuilder` ở đây: hàm thuần thì test được, và
 * `tickets.js` bọc `new ButtonBuilder(spec)` ở bước sau (đúng cách
 * `buildOpenPayload` tách khỏi `new EmbedBuilder(...)`).
 *
 * @returns {Array<{customId: string, label: string, emoji?: string, style: number}>}
 *   `style` là SỐ thuần vì file này không import discord.js (giữ được tính
 *   thuần); `tickets.js` map sang `ButtonStyle`.
 */
function buildPanelButtons(kinds) {
  const list = Array.isArray(kinds) ? kinds : [];
  return list.slice(0, MAX_TICKET_KINDS).map((kind, i) => ({
    customId: "ticket_open:" + kind.key,
    label: kind.label,
    // Chỉ đưa emoji vào khi đúng định dạng Discord — rác thì `setEmoji` NÉM
    // lỗi và hỏng luôn tin nhắn panel (mất đường mở ticket cho cả server).
    emoji: isUsableEmoji(kind.emoji) ? kind.emoji : undefined,
    // Nút đầu Primary (nổi nhất), các nút sau Secondary. Không dùng màu tuỳ
    // chỉnh của chủ server cho nút: Discord chỉ có 5 style cố định, `color`
    // chỉ áp cho embed — nhận nhầm là hiểu nhầm API.
    style: i === 0 ? 1 : 2,
  }));
}

/**
 * Dựng đặc tả modal mở ticket cho 1 loại — TRẢ OBJECT THUẦN.
 *
 * Ô "nội dung" LUÔN bắt buộc (không có nội dung thì ticket vô nghĩa); ô
 * "bằng chứng" tuỳ chọn. Nhãn rỗng → rơi về chuỗi dịch sẵn có, KHÔNG để
 * Discord ném lỗi vì label rỗng.
 */
function buildModalSpec(kind, T = {}) {
  const appeal = kind?.key === "appeal";
  const bodyLabel =
    kind?.question ||
    (appeal ? T.modalAppealLabel : T.openBodyLabelSupport) ||
    T.body ||
    "Nội dung";
  return {
    customId: "ticket_open_submit:" + (kind?.key ?? "support"),
    // Tiêu đề modal tối đa 45 ký tự — cắt ở đây, không phải lúc gửi API.
    title: (appeal ? T.openModalTitleAppeal : T.openModalTitleSupport) || "Mở ticket",
    bodyLabel,
    bodyPlaceholder:
      kind?.questionPlaceholder || (appeal ? undefined : T.openBodyPlaceholderSupport),
    evidenceLabel:
      kind?.evidenceQuestion || (appeal ? T.modalEvidenceLabel : T.openEvidenceLabel) || T.evidence,
    evidencePlaceholder: T.openEvidencePlaceholder,
    /**
     * Ô nhập bổ sung, ĐÃ gắn customId.
     *
     * `ticket_body` và `ticket_evidence` giữ nguyên tên cũ — code đọc ở
     * nhiều nơi (interactionCreate, DM modal) và test hiện có đều dựa vào
     * chúng. Ô bổ sung mới mang tiền tố `xf_` để không bao giờ đụng.
     */
    extraFields: normalizeExtraFields(kind?.fields).map((f) => ({
      customId: "xf_" + f.key,
      key: f.key,
      label: f.label,
      placeholder: f.placeholder,
      required: f.required,
      long: f.long,
    })),
  };
}

/**
 * Gom cặp {nhãn, giá trị} của các ô bổ sung mà người dùng đã điền.
 *
 * Bỏ ô rỗng: ô tuỳ chọn bỏ trống thì hiện dòng "Số tiền: —" làm nhiễu kênh
 * ticket cho staff, mà dữ liệu thì không thêm được gì.
 */
function collectExtraValues(entries, spec) {
  const out = [];
  for (const f of spec?.extraFields ?? []) {
    const value = String(entries?.[f.key] ?? "").trim();
    if (!value) continue;
    out.push({ key: f.key, label: f.label, value: clip(escapeMentions(value), EXTRA_VALUE_MAX) });
  }
  return out;
}

/** Người dùng có quyền staff theo danh sách role không. */
function isStaff(member, staffRoleIds) {
  if (!member) return false;
  const ids = Array.isArray(staffRoleIds) ? staffRoleIds : [];
  if (ids.length === 0) return false;
  // `member.roles.cache` là Collection; đọc `.has` nếu có, không ép theo mảng
  // để test dùng mảng thuần cũng chạy được.
  const roles = member.roles?.cache || member.roles;
  if (roles && typeof roles.has === "function") return ids.some((id) => roles.has(id));
  if (Array.isArray(roles)) return ids.some((id) => roles.includes(id));
  return false;
}

/**
 * Dựng payload embed mở ticket — TRẢ OBJECT THUẦN, không phải EmbedBuilder.
 *
 * Vì sao không EmbedBuilder: hàm thuần thì test được. `tickets.js` bọc object
 * này vào `new EmbedBuilder(payload)` ở bước sau.
 *
 * `TICKET_TEXT` là bảng chuỗi đã dịch; nội dung người dùng đã escape qua
 * `sanitizeBody` trước khi tới đây.
 */
function buildOpenPayload({
  TICKET_TEXT: T,
  number,
  kind,
  kindLabel,
  openerName,
  openedById = null,
  body,
  evidence,
  extraFields = [],
}) {
  const num = String(number);
  // Loại tuỳ chỉnh có nhãn riêng → dùng nhãn đó làm tiêu đề, thay 2 tiêu đề
  // cứng. Escape + bỏ `{}` vì nhãn do CHỦ SERVER soạn và đi thẳng vào embed
  // (nhãn gõ `@everyone` sẽ ping cả server mỗi lần có người mở ticket).
  const custom = kindLabel
    ? `${escapeMentions(String(kindLabel)).replace(/[{}]/g, "").trim()} #${num}`
    : "";
  return {
    title:
      custom ||
      (normalizeKind(kind) === "appeal" ? T.openedTitle : T.supportTitle).replace("{n}", num),
    fields: [
      {
        name: T.openedBy,
        value: openedById ? `<@${openedById}>\n${openerName}` : openerName,
        inline: true,
      },
      { name: T.status, value: num, inline: true },
      { name: T.body, value: body || "—", inline: false },
      { name: T.evidence, value: evidence || T.noEvidence, inline: false },
      // Ô bổ sung của chủ server. Nhãn đã escape sẵn ở collectExtraValues;
      // escape thêm 1 lần ở đây để hàm này an toàn khi gọi từ nơi khác.
      ...(Array.isArray(extraFields) ? extraFields : [])
        .filter((f) => f && String(f.value ?? "").trim())
        .slice(0, MAX_KIND_EXTRA_FIELDS)
        .map((f) => ({
          name: clip(escapeMentions(f.label), KIND_MODAL_LABEL_MAX),
          value: clip(escapeMentions(f.value), EXTRA_VALUE_MAX),
          inline: false,
        })),
    ],
    footer: T.staffOnboard,
  };
}

/** Số phút chờ còn lại của cooldown (làm tròn lên để hiển thị). */
function cooldownMinutesLeft(lastOpenedAt, cooldownHours, now = Date.now()) {
  if (!lastOpenedAt || cooldownHours <= 0) return 0;
  const total = cooldownHours * 60;
  const elapsed = (now - lastOpenedAt) / 60_000;
  return Math.max(0, Math.ceil(total - elapsed));
}

/* ══════════════════════════════════════════════════════════════════════
   TỰ ĐÓNG — phần thuần (đợt nâng cấp)
   ══════════════════════════════════════════════════════════════════════ */

/** Mặc định: không ai chat 24 giờ thì bot tự đóng. */
const IDLE_HOURS_DEFAULT = 24;

/** Trần 30 ngày — quá dài thì tiền điện kênh đến vô ích. */
const IDLE_HOURS_MAX = 720;

/** Sau khi đóng tay, giữ kênh 24h rồi mới lưu transcript + xoá. */
const CLOSE_GRACE_DEFAULT = 24;

/** Lý do đóng cắt tối đa 300 ký tự (khớp trần botCloseTicket bên Convex). */
const CLOSE_REASON_MAX = 300;

/**
 * Chuẩn hoá `ticketIdleHours`. 0 = TẮT HẲN (không tự đóng).
 *
 * Vì sao 0 hợp lệ: có chủ server muốn ticket sống tới khi staff đóng tay —
 * ép mọi server dùng tự đóng sẽ khiến họ tắt cả tính năng.
 */
function normalizeIdleHours(value) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(IDLE_HOURS_MAX, n);
}

/** Chuẩn hoá `ticketCloseGraceHours`. Tối thiểu 1h — xoá ngay lập tức mất transcript. */
function normalizeGraceHours(value) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1) return CLOSE_GRACE_DEFAULT;
  return Math.min(IDLE_HOURS_MAX, n);
}

/**
 * Ticket có đã quá hạn chưa.
 *
 * @param {object} t     bản ghi ticket (cần lastActivityAt, createdAt, status)
 * @param {number} idleHours  đã chuẩn hoá qua normalizeIdleHours
 * @param {number} now   mốc thời gian (mặc định Date.now())
 *
 * idleHours = 0 → LUÔN false (đã tắt). Chưa từng có hoạt động nào thì tính
 * từ createdAt — nếu không, ticket mở rồi không ai nói sẽ đóng ngay lập tức.
 */
function isIdleExpired(t, idleHours, now = Date.now()) {
  if (!t || t.status !== "open") return false;
  const hours = normalizeIdleHours(idleHours);
  if (hours <= 0) return false;
  const last = t.lastActivityAt || t.createdAt || 0;
  if (!last) return false;
  return now - last >= hours * 3_600_000;
}

/** Đã đủ giờ giữ kênh sau khi đóng để lưu transcript + xoá chưa. */
function isPurgeDue(t, graceHours, now = Date.now()) {
  if (!t || t.status !== "closed") return false;
  if (t.transcriptStorageId) return false; // đã lưu rồi — không xoá 2 lần
  const grace = normalizeGraceHours(graceHours);
  const closed = t.closedAt || 0;
  if (!closed) return false;
  return now - closed >= grace * 3_600_000;
}

/** Số giờ còn lại trước khi bị dọn (hiển thị cho staff, 0 = không có hạn). */
function purgeHoursLeft(t, graceHours, now = Date.now()) {
  if (!t || t.status !== "closed" || t.transcriptStorageId) return 0;
  const closed = t.closedAt || 0;
  if (!closed) return 0;
  const totalMin = normalizeGraceHours(graceHours) * 60;
  const elapsedMin = (now - closed) / 60_000;
  // Trả về GIỜ (đúng như tên hàm). Trước đây trả phút → panel hiện
  // "1380 giờ" cho một khoảng 24 giờ. Tính tròn LÊN để không bao giờ
  // hứa dọn sớm hơn thực tế.
  return Math.max(0, Math.ceil((totalMin - elapsedMin) / 60));
}

/* ══════════════════════════════════════════════════════════════════════
   PANEL TUỲ BIẾN
   ══════════════════════════════════════════════════════════════════════ */

/** Nội dung panel cắt tối đa 1000 ký tự (khớp trần validate ở Convex). */
const PANEL_MAX = 1000;

/**
 * Thay placeholder trong nội dung tuỳ biến của chủ server.
 *
 * Placeholder hỗ trợ:
 *   - panel TRONG kênh ticket: {user} người mở, {number} số ticket, {kind} loại,
 *     {idle} số giờ tự đóng;
 *   - panel MỞ ở kênh công khai: {server} tên server, {open} số ticket đang mở,
 *     {support} loại mặc định. Hai nhóm dùng chung hàm nhưng nội dung này dán
 *     nơi công khai cho cả server đọc nên không có {user}/{number}.
 *
 * ⚠️ BẮT BUỘC escape trước khi thay: nội dung này dán vào embed. Chủ server
 * gõ `@everyone` trong ô tuỳ chỉnh sẽ ping cả server mỗi lần có người mở
 * ticket — hàng rào chống ping áp cho cả chủ server.
 */
function fillPanelText(template, values, T = {}) {
  const src = String(template ?? "").trim();
  if (!src) return String(T.panelTitle || "").replace(/\{(\w+)\}/g, "");
  const safe = {
    user: escapeMentions(values?.user ?? ""),
    number: escapeMentions(String(values?.number ?? "")),
    kind: escapeMentions(String(values?.kind ?? "")),
    idle: escapeMentions(String(values?.idle ?? "")),
    server: escapeMentions(String(values?.server ?? "")),
    open: escapeMentions(String(values?.open ?? "")),
    support: escapeMentions(String(values?.support ?? "")),
  };
  return escapeMentions(src)
    .slice(0, PANEL_MAX)
    .replace(/\{(\w+)\}/g, (m, key) => (key in safe ? safe[key] : m));
}

/**
 * Màu tuỳ chỉnh do chủ server nhập (chuỗi hex) → số nguyên 0xRRGGBB mà
 * `EmbedBuilder.setColor` chịu.
 *
 * Vì sao phải có hàm này: `setColor` NÉM TypeError khi nhận chuỗi, nên
 * chủ server gõ "đỏ" hay "#GGGGGG" là hỏng CẢ panel kèm nút Mở ticket — chứ
 * không chỉ hỏng màu. Rác thì rơi về `fallback` (màu mặc định của bot).
 */
function parsePanelColor(hex, fallback) {
  const clean = String(hex ?? "")
    .trim()
    .replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return fallback;
  return parseInt(clean, 16);
}

/**
 * Chuẩn hoá lý do đóng do staff gõ.
 *
 * Cắt 300 ký tự + escape mention: lý do này hiện trong embed VÀ được gửi DM
 * cho người mở. Không escape thì staff (vô tình) gõ `<@&id>` là bot ping role
 * đó trong tin nhắn riêng của người dùng.
 */
function sanitizeCloseReason(text) {
  return clip(escapeMentions(String(text ?? "").trim()), CLOSE_REASON_MAX);
}

/**
 * Danh sách mention role để tag khi mở ticket.
 *
 * Chỉ nhận snowflake hợp lệ, tối đa 3. Không cắt theo "tính hợp lệ" im lặng
 * mà không nói — người gọi sẽ tưởng role đã được tag.
 */
function buildRoleMentions(roleIds) {
  const out = [];
  const seen = new Set();
  for (const raw of Array.isArray(roleIds) ? roleIds : []) {
    const id = String(raw ?? "").trim();
    if (!/^\d{15,22}$/.test(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push("<@&" + id + ">");
    if (out.length >= 3) break;
  }
  return out;
}

module.exports = {
  BODY_MAX,
  EVIDENCE_MAX,
  CHANNEL_NAME_MAX,
  DEFAULTS,
  ZERO_WIDTH,
  escapeMentions,
  clip,
  sanitizeBody,
  stripDiacritics,
  sanitizeChannelName,
  buildChannelName,
  buildChannelNameFromTemplate,
  isBudgetExceeded,
  decideOpen,
  normalizeLimit,
  MAX_TICKET_KINDS,
  KIND_LABEL_MAX,
  KIND_MODAL_LABEL_MAX,
  KIND_PLACEHOLDER_MAX,
  KIND_DESC_MAX,
  MAX_KIND_EXTRA_FIELDS,
  EXTRA_VALUE_MAX,
  defaultTicketKinds,
  normalizeKinds,
  normalizeExtraFields,
  findKind,
  normalizeKind,
  staffRoleIdsForKind,
  isUsableEmoji,
  buildPanelButtons,
  buildModalSpec,
  collectExtraValues,
  isStaff,
  buildOpenPayload,
  cooldownMinutesLeft,
  IDLE_HOURS_DEFAULT,
  IDLE_HOURS_MAX,
  CLOSE_GRACE_DEFAULT,
  CLOSE_REASON_MAX,
  PANEL_MAX,
  normalizeIdleHours,
  normalizeGraceHours,
  isIdleExpired,
  isPurgeDue,
  purgeHoursLeft,
  fillPanelText,
  parsePanelColor,
  sanitizeCloseReason,
  buildRoleMentions,
};
