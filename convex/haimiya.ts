"use node";

/// <reference types="node" />

/** Minimal env typing so this file also type-checks from the Vite app. */
declare const process: {
  env: Record<string, string | undefined>;
};

import { action } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { requireFuncKey } from "./botFunc";

/** Kiến thức cốt lõi về Protogon — dùng làm system prompt cho AI thật. */
const SYSTEM_PROMPT = `Bạn là Haimiya, trợ lý ảo của Protogon — một bot Discord bảo vệ server do người dùng quản lý.

QUY TẮC XƯNG HÔ (bắt buộc):
- Tự xưng là "tôi" hoặc "mình".
- Gọi người dùng là "bạn".
- Giọng điệu chuẩn chỉnh, nghiêm túc, lịch sự, rõ ràng, thân thiện. Không dùng kiểu "em", "senpai", "người yêu dấu" hay ngôn ngữ dễ thương quá mức.
- Trả lời bằng {LANG}, ngắn gọn, đúng trọng tâm, có thể dùng bullet để liệt kê.

PHẠM VI TRẢ LỜI — MỞ, KHÔNG GIỚI HẠN:
- Bạn KHÔNG bị giới hạn chỉ nói về Protogon. Bạn có thể trò chuyện thoải mái về mọi chủ đề ngoài lề: kiến thức chung, học tập, giải trí, anime/manga, âm nhạc, đời sống, tâm sự, tư vấn, kể chuyện...
- Khi được hỏi ngoài lề, hãy trả lời nhiệt tình bằng hiểu biết chung của bạn, tự nhiên như một người bạn. Không từ chối, không nói "ngoài phạm vi", không báo "bị giới hạn".
- Nếu câu hỏi liên quan Protogon hoặc Discord, hãy ưu tiên trả lời chính xác theo kiến thức bên dưới.

KIẾN THỨC CHUYÊN SÂU VỀ PROTOGON (dùng khi được hỏi về bot):
- Hệ thống nhiệt độ 4 giai đoạn: vi phạm cộng điểm nhiệt (0-100), ngưỡng mặc định cảnh báo 25, tạm khóa 40, kick 70, ban 90; hạ nhiệt theo phút, tái phạm bị nhân nhiệt (mặc định x2 trong 30 phút). Warn tích lũy: đủ N lần (mặc định 3 trong 60 phút) tự tăng cấp hình phạt.
- Moderation: chống spam tin nhắn, spam mention, từ ngữ xấu, spam ảnh/file, chặn link mời Discord, chống link độc hại + file nguy hiểm (.exe .scr .bat .msi .vbs .ps1 .jar .apk .hta).
- Join Gate: cổng vào server chống selfbot — chặn tài khoản quá mới, không avatar, không huy hiệu, chặn lượt vào khi đang raid; có danh sách trắng.
- Chống nuke/raid: 24 module (ban/kick/raid thành viên hàng loạt, tạo/xóa/đổi tên kênh, tạo/xóa/sửa role, gán role & biệt danh hàng loạt, xóa tin nhắn, webhook, thread, emoji, tự cấp quyền quản trị, bot lạ, raid app ngoài, invite, can thiệp cấu hình server, bot hit-and-run) — phạt trực tiếp theo audit log, không cộng nhiệt; có khóa kênh tự động (lockdown), cảnh báo bot lạ mới vào, kèm 8 module auto-moderation nội dung (spam, mass message, blank noise, mention, badword, attachment, invite, malware) theo nhiệt độ vi phạm.
- Công cụ Mod: /mod timeout, /mod kick, /mod ban, /mod purge (lệnh text: !timeout !kick !ban !purge) — ghi đầy đủ lý do + người thực hiện vào kênh log và bảng hình phạt trên dashboard.
- Giveaway: /giveaway start hoặc !giveaway start, hoặc tạo trên dashboard — 4 mẫu tin nhắn (mặc định, sang trọng, VIP, nhanh gọn), chèn ảnh, lời dẫn tùy chỉnh, yêu cầu role tham gia, role thưởng tự cấp cho người thắng, DM người thắng tùy chọn.
- Reaction Role: thành viên bấm emoji tự nhận/gỡ role; tối đa 10 bảng x 20 cặp; tạo/chỉnh bảng bằng dashboard hoặc lệnh /reactionrole create/add/remove/edit/delete + !reactionrole.
- Gửi DM trực tiếp: admin nhập User ID + nội dung, bot nhắn riêng trong ~1 phút.
- Backup server: /backup hoặc !backup — chụp role, kênh, quyền, tin nhắn kèm media, emoji/sticker; bản nén đẩy GitHub Gist chủ bot; tự động backup 2–30 ngày; khôi phục vào server khác, nhập cả file backup bot nuke (.msc).
- Báo cáo khẩn: /report + !report — AI dò hàng trăm tin nhắn gần nhất để báo raid/nuke hoặc lỗi phạt nhầm của bot cho cả server.
- Threat Intel: bot tự học từ nguồn an ninh mỗi giờ (/research status|learn|history), dùng từ khóa mới miễn phí trong bộ lọc link độc hại.
- Auto Reply: rule theo từ khóa hoặc @mention, hỗ trợ {user}, {username}, cooldown.
- Tính năng ẩn: khu vực trên dashboard chỉ admin sở hữu bot mới được mở khóa bằng mật khẩu (reaction role, giveaway, gửi DM, auto reply, tùy chỉnh giao diện).
- Tùy chỉnh giao diện: đổi avatar bot + avatar Haimiya ngay trên web, và chủ đề màu riêng cho từng server trong Cài đặt.
- Báo cáo hàng ngày: gửi vào kênh log kèm nhiệt độ + warn tích lũy từng thành viên.
- Bảng hình phạt: trên dashboard liệt kê timeout/kick/ban/purge với lý do và người thực hiện.
- Bot chạy trên hosting (Wispbyte...): tải zip từ nhánh host-deploy trên GitHub, upload + unarchive + restart.
- Nếu bạn không chắc chắn, hãy trả lời trung thực và đề nghị kiểm tra dashboard hoặc cài đặt.`;

/**
 * Chọn provider AI theo thứ tự ưu tiên (tất cả tương thích OpenAI chat completions):
 *   1. Gateway OpenAI-compatible (Groq, kiosapi, ...): AI_BASE_URL + AI_API_KEY + AI_MODEL
 *   2. Groq free (không cần credit card, 30 RPM, 14.4K RPD): GROQ_API_KEY
 *   3. NVIDIA NIM free (40 RPM / 4M TPM, không cần thẻ): NVIDIA_API_KEY
 *      hoặc key riêng cho DeepSeek: DEEPSEEK_NIM_KEY (deepseek-v4-pro-0813)
 *   4. SambaNova: SAMBANOVA_API_KEY (mặc định Meta-Llama-3.3-70B-Instruct)
 *   5. OpenAI: OPENAI_API_KEY (+ OPENAI_MODEL, mặc định gpt-4o-mini)
 *
 * Free tier từ awesome-freellm-apis:
 * - Groq: 30 RPM, 14,400 RPD — MIỄN PHÍ, không cần thẻ
 * - SambaNova: 20 RPM, 20 RPD, model deepseek-v3-1 — MIỄN PHÍ, cần đăng ký
 *
 * LƯU Ý (15/09/2026): Groq đã NGỪNG phục vụ llama-3.3-70b-versatile từ 08/2026 —
 * mặc định mới là openai/gpt-oss-120b (model thay thế Groq khuyến nghị).
 */
/** Một provider AI tương thích chuẩn OpenAI chat completions. */
type AiProvider = { key: string; baseUrl: string; model: string };

function aiProviders(): AiProvider[] {
  const out: AiProvider[] = [];
  // 1. Gateway tùy chỉnh (Groq/kiosapi qua env) — model gateway tự chọn, mặc định
  // là model dự phòng còn được hỗ trợ (xem FALLBACK_MODEL dưới).
  const groqKey = process.env.AI_API_KEY;
  if (groqKey && process.env.AI_BASE_URL) {
    out.push({
      key: groqKey,
      baseUrl: process.env.AI_BASE_URL,
      model: process.env.AI_MODEL ?? FALLBACK_MODEL,
    });
  }
  // 2. Groq free trực tiếp (không qua gateway) — model mặc định là model CỦA GROQ
  // còn phục vụ (llama-3.3-70b-versatile đã bị retire 08/2026 → mọi call lỗi 400
  // và chat web rơi về fallback cục bộ dù key hợp lệ).
  const groqDirectKey = process.env.GROQ_API_KEY;
  if (groqDirectKey) {
    out.push({
      key: groqDirectKey,
      baseUrl: "https://api.groq.com/openai/v1",
      model: process.env.AI_MODEL ?? FALLBACK_MODEL,
    });
  }
  // 3. NVIDIA NIM free (https://build.nvidia.com — 40 RPM, 4M TPM)
  const nvidiaKey = process.env.NVIDIA_API_KEY;
  if (nvidiaKey) {
    out.push({
      key: nvidiaKey,
      baseUrl: "https://integrate.api.nvidia.com/v1",
      model: process.env.NVIDIA_MODEL ?? "mistralai/mistral-nemotron",
    });
  }
  // 3b. NVIDIA NIM với model DeepSeek V4 Pro (key NIM riêng, mạnh hơn)
  const deepseekNimKey = process.env.DEEPSEEK_NIM_KEY;
  if (deepseekNimKey) {
    out.push({
      key: deepseekNimKey,
      baseUrl: "https://integrate.api.nvidia.com/v1",
      model: process.env.DEEPSEEK_NIM_MODEL ?? "deepseek-ai/deepseek-v4-pro-0813",
    });
  }
  // 4. SambaNova free
  const sambanovaKey = process.env.SAMBANOVA_API_KEY;
  if (sambanovaKey) {
    out.push({
      key: sambanovaKey,
      baseUrl: "https://api.sambanova.ai/v1",
      model: "Meta-Llama-3.3-70B-Instruct",
    });
  }
  // 5. OpenAI (trả phí)
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    out.push({
      key: openaiKey,
      baseUrl: "https://api.openai.com/v1",
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    });
  }
  return out;
}

/**
 * Provider ĐẦU TIÊN trong danh sách — chỉ dùng cho phần báo trạng thái
 * (model + gatewayHost) và các nhánh "chưa cấu hình". Lời gọi thật dùng
 * `aiProviders()` để còn đường lùi khi một provider hỏng.
 */
function aiProvider(): AiProvider | null {
  return aiProviders()[0] ?? null;
}

/**
 * Model dự phòng ĐẢM BẢO còn được phục vụ — dùng khi:
 *  - env không đặt AI_MODEL, hoặc
 *  - model cấu hình trả lỗi 400/404 (không tồn tại / đã bị ngừng — Groq retire
 *    llama-3.3-70b-versatile 08/2026 khiến Haimiya "im lặng" toàn bộ).
 */
const FALLBACK_MODEL = "openai/gpt-oss-120b";

/**
 * Chỉ dẫn thay thế khi lượt cuối chỉ có ẢNH, không kèm chữ (người dùng chụp
 * màn hình rồi bấm gửi). Một số provider từ chối content part text rỗng, và
 * lượt rỗng cũng không bảo được model làm gì — dùng lượt chỉ dẫn mặc định
 * giữ đúng ý "xem ảnh này giúp tôi".
 */
const IMAGE_ONLY_PROMPT = "Hãy mô tả và giải thích ảnh này.";

/**
 * Fetch có giới hạn thời gian — gateway treo/DNS chết không được giữ action
 * sống vô hạn (Convex action có budget thời gian, treo = đốt tài nguyên).
 */
async function aiFetch(url: string, init: RequestInit): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
}

/** Content part cho vision: text hoặc image_url (chuẩn OpenAI-compatible). */
type ChatContent =
  | string
  | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;

/**
 * Ngân sách thời gian cho cả chuỗi provider × model. 6 provider × 2 model ×
 * timeout 20s có thể kéo action quá 4 phút — người dùng đã bỏ ô chat. Hết
 * ngân sách thì dừng và báo lý do cuối thay vì treo.
 */
const CHAIN_BUDGET_MS = 45_000;

/**
 * Diễn giải lỗi HTTP thành câu tiếng Việt CÓ HÀNH ĐỘNG, kèm host để biết
 * đang hỏng provider nào. Không nhét JSON thô của gateway: web render thẳng
 * `reason` cho người dùng, mà `{"error":{"message":"Invalid API Key"...}}`
 * chỉ là rác kỹ thuật — ai cũng bỏ cuộc đọc (bug thật 05/10/2026).
 */
function describeHttpFailure(host: string, status: number, model: string, body: string): string {
  if (status === 401 || status === 403)
    return `${host} từ chối key (lỗi ${status}) — API key không hợp lệ hoặc đã hết hạn`;
  if (status === 400 || status === 404)
    return `${host} không phục vụ model "${model}" (lỗi ${status})`;
  if (status === 429) return `${host} giới hạn tần suất (lỗi 429)`;
  const detail = body.slice(0, 100).replace(/\s+/g, " ");
  return `${host} trả lỗi ${status}${detail ? `: ${detail}` : ""}`;
}

/** Gộp nhiều lỗi provider thành MỘT câu để web hiển thị. */
function summarizeFailures(failures: string[], providerCount: number, truncated: boolean): string {
  const uniq = [...new Set(failures)];
  if (uniq.length === 0) return "AI gateway không phản hồi";
  const allAuth = uniq.every((f) => f.includes("từ chối key"));
  // Mọi key đều bị từ chối → đây là lỗi CẤU HÌNH, nói thẳng ra để người
  // dùng biết phải sửa env chứ không phải lỗi model/tạm thời.
  if (allAuth) {
    const scope = providerCount > 1 ? `Cả ${providerCount} provider AI đều ` : "";
    return `${scope}từ chối key (401/403) — key AI trên Convex sai hoặc hết hạn, cần cấu hình lại`;
  }
  const scope = providerCount > 1 ? `${providerCount} provider AI đều lỗi: ` : "";
  const more = uniq.length > 2 ? ` (+${uniq.length - 2} lỗi khác)` : "";
  const tail = truncated ? " — dừng sớm vì hết thời gian chờ" : "";
  return scope + uniq.slice(0, 2).join("; ") + more + tail;
}

/** Host của baseUrl — chỉ để hiển thị, không bao giờ lộ key. */
function providerHost(baseUrl: string): string {
  try {
    return new URL(baseUrl).host;
  } catch {
    return "AI gateway";
  }
}

/**
 * Gọi chat completions với TỰ VÁ MODEL **VÀ TỰ LÙI PROVIDER**:
 *  - Trong mỗi provider: thử model cấu hình, lỗi 400/404 (model chết) thì thử
 *    lại đúng 1 lần với FALLBACK_MODEL — Haimiya tự phục hồi khi model bị retire
 *    mà không cần can thiệp tay vào env.
 *  - Provider hỏng (401/403 key sai, 429, 5xx, mạng/DNS, timeout) → thử TIẾP
 *    provider kế tiếp thay vì bỏ cuộc. Bug thật 05/10/2026: trước đây gặp 401
 *    là `return` ngay, nên gateway hỏng key chặn cả các provider free dự phòng
 *    và Haimiya im luôn chỉ vì một key sai.
 *  - Trả `reason` tường minh, đã dịch thành hành động được.
 */
async function chatCompletion(
  providers: AiProvider[],
  messages: Array<{ role: string; content: ChatContent }>,
  opts: { maxTokens: number; temperature: number },
): Promise<{ ok: true; reply: string } | { ok: false; reason: string }> {
  const deadline = Date.now() + CHAIN_BUDGET_MS;
  const failures: string[] = [];
  let truncated = false;
  for (const p of providers) {
    if (Date.now() >= deadline) {
      truncated = true;
      break;
    }
    const host = providerHost(p.baseUrl);
    for (const model of Array.from(new Set([p.model, FALLBACK_MODEL]))) {
      try {
        const res = await aiFetch(`${p.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${p.key}`,
          },
          body: JSON.stringify({
            model,
            messages,
            max_tokens: opts.maxTokens,
            temperature: opts.temperature,
          }),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          failures.push(describeHttpFailure(host, res.status, model, text));
          // Chỉ 400/404 là lỗi MODEL → thử lại bằng model dự phòng cùng provider.
          // 401/403 (key), 429, 5xx đổi model cũng vô ích → next provider.
          if (res.status === 400 || res.status === 404) continue;
          break;
        }
        const data = (await res.json()) as {
          choices?: { message?: { content?: string } }[];
        };
        const reply = data?.choices?.[0]?.message?.content?.trim() ?? "";
        if (reply) return { ok: true, reply };
        // Nội dung rỗng: thử provider kế tiếp trước khi báo lỗi.
        failures.push(`${host} trả về nội dung rỗng`);
        break;
      } catch (e) {
        failures.push(
          e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")
            ? `${host} quá thời gian phản hồi (timeout 20s)`
            : `${host} không kết nối được (mạng/DNS)`,
        );
        break;
      }
    }
  }
  return { ok: false, reason: summarizeFailures(failures, providers.length, truncated) };
}

/** Rate-limit trong bộ nhớ cho haimiya.ask: identity → mốc gọi gần đây (60s window). */
const askBuckets = new Map<string, { calls: number[] }>();

export const ask = action({
  args: {
    messages: v.array(
      v.object({
        role: v.union(v.literal("user"), v.literal("assistant")),
        content: v.string(),
      }),
    ),
    /**
     * Ảnh đính kèm (vision) — base64 data URL, TỐI ĐA 3 ảnh, mỗi ảnh ≤ 400KB
     * sau khi web nén (canvas resize ≤ 1024px). Chỉ tin nhắn user mới kèm ảnh.
     * Chuẩn OpenAI-compatible: content parts image_url cho các model vision
     * (gpt-4o-mini, llama-4 scout/maverick trên Groq, ...).
     */
    images: v.optional(
      v.array(
        v.object({
          /** data URL "data:image/jpeg;base64,..." — mime + base64 gộp một. */
          dataUrl: v.string(),
        }),
      ),
    ),
    /** Token phiên đăng nhập web (sessions) — bắt buộc nếu chưa đặt FUNC_SEED. */
    token: v.optional(v.string()),
    /** Chìa khóa chức năng (botFunc) — chống lạm dụng lượt gọi AI free tier khi đã cấu hình FUNC_SEED. */
    funcKey: v.optional(v.string()),
    /**
     * Ngôn ngữ trả lời do dashboard gửi lên ("vi" mặc định — sản phẩm gốc).
     * Chỉ đổi chỉ dẫn ngôn ngữ trong system prompt, KHÔNG dịch prompt: phần
     * kiến thức về Protogon giữ nguyên tiếng Việt để không lệch ngữ cảnh.
     */
    lang: v.optional(v.union(v.literal("vi"), v.literal("en"), v.literal("de"))),
  },
  handler: async (ctx, { messages, images, token, funcKey, lang }) => {
    requireFuncKey(funcKey, process.env.FUNC_SEED);
    // Khi chưa cấu hình FUNC_SEED: vẫn yêu cầu ĐĂNG NHẬP — kẻ ngoài không thể
    // đốt lượt gọi AI free tier của deployment (trước đây action mở hoàn toàn).
    // LỖI TRẢ DẠNG offline+reason thay vì throw: Convex production MASK message
    // của action (kể cả ConvexError) thành "Server Error" — web không thể phân
    // biệt "chưa đăng nhập" với "AI chết" nếu throw.
    let rateIdentity = "anon";
    if (!process.env.FUNC_SEED) {
      const me = token
        ? await ctx.runQuery(internal.sessionHardening.getUserByTokenInternal, { token })
        : null;
      if (!me)
        return {
          reply: "",
          offline: true,
          reason: "Vui lòng đăng nhập dashboard để trò chuyện với Haimiya",
          needLogin: true,
        };
      rateIdentity = me.discordId;
    } else {
      // funcKey hợp lệ: vẫn giới hạn theo hiệu chỉnh SHA của key (tránh đốt token).
      rateIdentity = "func:" + (funcKey ? funcKey.slice(0, 16) : "bare");
    }
    // Rate limit chống đốt hạn mức AI free: tối đa 20 lần/phút trên một identity.
    // Bộ nhớ trong chỉ tồn tại trên 1 instance action — đủ chặn spam thủ công &
    // script nhanh; bot/preset hệ thống KHÔNG đi qua đường này.
    const nowMs = Date.now();
    const windowMs = 60_000;
    const bucket = askBuckets.get(rateIdentity);
    if (bucket) {
      bucket.calls = bucket.calls.filter((t) => nowMs - t < windowMs);
      if (bucket.calls.length >= 20) {
        return {
          reply: "",
          offline: true,
          reason: "Bạn đang gửi quá nhanh — thử lại sau ít phút nhé ⏳",
        };
      }
      bucket.calls.push(nowMs);
    } else {
      askBuckets.set(rateIdentity, { calls: [nowMs] });
    }
    if (askBuckets.size > 500) {
      // Dọn bucket cũ để không rò rỉ bộ nhớ.
      for (const [k, b] of askBuckets) {
        if (b.calls.every((t) => nowMs - t > windowMs)) askBuckets.delete(k);
      }
    }
    // Cap kích thước đầu vào: mỗi tin nhắn ≤ 2.000 ký tự, tối đa 8 tin —
    // chặn payload khổng lồ làm tốn token hệ thống prompt.
    const safeMessages = messages
      .slice(-8)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
    const providers = aiProviders();
    if (providers.length === 0)
      return {
        reply: "",
        offline: true,
        reason: "AI chưa cấu hình trên máy chủ (thiếu AI_API_KEY/GROQ_API_KEY)",
      };
    const last = safeMessages[safeMessages.length - 1];

    // VISION — validate ảnh: chỉ nhận data URL jpeg/png/webp, cap 3 ảnh × 550KB
    // (base64 ~737KB wire). LỰA CHỌN AN TOÀN: ảnh lỗi/không hợp lệ bị bỏ qua
    // (vẫn trả lời text) thay vì fail cả lượt chat.
    const IMAGE_MIME = /^(data:image\/(?:jpeg|png|webp);base64,)/;
    const MAX_IMAGES = 3;
    const MAX_IMAGE_CHARS = 750_000; // ~550KB binary
    const validImages = (images ?? [])
      .filter((img) => typeof img?.dataUrl === "string" && IMAGE_MIME.test(img.dataUrl))
      .filter((img) => img.dataUrl.length <= MAX_IMAGE_CHARS)
      .slice(0, MAX_IMAGES);

    // Lượt cuối rỗng + KHÔNG có ảnh hợp lệ → không còn gì để hỏi, từ chối.
    // Có ảnh thì KHÔNG từ chối: coi như lượt "mô tả ảnh này" (người dùng chụp
    // màn hình rồi bấm gửi, không gõ chữ). Trước đây từ chối ở đây khiến ảnh
    // bị bỏ rơi hoàn toàn — web báo "AI chưa phản hồi — Tin nhắn rỗng" rồi
    // trả lời bằng kiến thức cục bộ (bug thật 27/09/2026).
    if (!last?.content?.trim() && validImages.length === 0) {
      return { reply: "", offline: true, reason: "Tin nhắn rỗng" };
    }

    const history = safeMessages.map((m, i) => {
      // Chỉ tin nhắn user CUỐI được ghép ảnh (mô hình vision chuẩn OpenAI:
      // history text thuần, ảnh nằm trong turn hiện tại).
      if (m.role !== "user" || i !== safeMessages.length - 1 || validImages.length === 0) {
        return { role: m.role, content: m.content };
      }
      return {
        role: m.role,
        content: [
          { type: "text", text: m.content.trim() || IMAGE_ONLY_PROMPT } as const,
          ...validImages.map(
            (img) => ({ type: "image_url", image_url: { url: img.dataUrl } }) as const,
          ),
        ],
      };
    });

    // Ngôn ngữ đầu ra: mặc định tiếng Việt (bot/dashboard VI), "en"/"de" khi
    // người dùng chọn tiếng Anh/tiếng Đức trên web.
    const systemPrompt = SYSTEM_PROMPT.replace(
      "{LANG}",
      lang === "en"
        ? "tiếng Anh (English) — mọi câu, tiêu đề và bullet đều bằng tiếng Anh"
        : lang === "de"
          ? "tiếng Đức (Deutsch) — mọi câu, tiêu đề và bullet đều bằng tiếng Đức"
          : "tiếng Việt",
    );
    const systemWithVision =
      validImages.length > 0
        ? `${systemPrompt}\n\nNGƯỜI DÙNG VỪA GỬI ${validImages.length} ẢNH. Hãy xem kỹ nội dung ảnh và trả lời theo câu hỏi kèm theo. Nếu ảnh chứa thông tin nhạy cảm (mật khẩu, token, thông tin cá nhân), hãy nhắc người dùng che thông tin đó.`
        : systemPrompt;

    const r = await chatCompletion(
      providers,
      [{ role: "system", content: systemWithVision }, ...history],
      {
        maxTokens: 700,
        temperature: 0.6,
      },
    );
    if (r.ok) return { reply: r.reply, offline: false };
    return { reply: "", offline: true, reason: r.reason };
  },
});

/**
 * Chẩn đoán công khai: AI đã cấu hình trên deployment chưa (chỉ trả cờ —
 * KHÔNG BAO GIỜ trả giá trị key). Web dashboard dùng để phân biệt "chat trả
 * lời rỗng vì chưa cấu hình AI" với lỗi thật khác.
 */
import { rateLimitPublicAction } from "./rateGuard";

export const aiStatus = action({
  args: {},
  handler: async (ctx) => {
    // Endpoint public KHÔNG auth — guard chống đốt usage (rẻ nên trần thoải mái).
    const guard = await rateLimitPublicAction(ctx, {
      name: "aiStatus",
      maxPerMin: 60,
      globalMaxPerMin: 1200,
    });
    if (!guard.ok) {
      // No-throw: trả "chưa cấu hình" — web coi như AI offline, không lộ gì thêm.
      return {
        configured: false,
        model: null,
        fallbackModel: FALLBACK_MODEL,
        gatewayHost: null,
        /** 0 provider — endpoint bị chặn rate-limit nên không suy ra được. */
        providerCount: 0,
        rateLimited: true,
      };
    }
    const p = aiProvider();
    return {
      configured: !!p,
      model: p?.model ?? null,
      /** Model dự phòng sẽ được dùng nếu model cấu hình lỗi 400/404. */
      fallbackModel: FALLBACK_MODEL,
      /**
       * Số provider AI đang có key trên deployment. Phân biệt ngay tình huống
       * "1 provider (key hỏng là chết)" với "nhiều provider (còn đường lùi)" —
       * không cần đoán từ `model`/`gatewayHost`.
       */
      providerCount: aiProviders().length,
      // Chỉ xuất host nguồn (an toàn — không chứa key, giúp biết đang qua gateway nào).
      gatewayHost: p
        ? (() => {
            try {
              return new URL(p.baseUrl).host;
            } catch {
              return null;
            }
          })()
        : null,
      rateLimited: false,
    };
  },
});
