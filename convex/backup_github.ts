"use node";

/// <reference types="node" />

/** Minimal env typing so this file also type-checks from the Vite app. */
declare const process: {
  env: Record<string, string | undefined>;
};

import { action } from "./_generated/server";
import { api } from "./_generated/api";
import { v } from "convex/values";
import { requireBotKeyStrict } from "./botAuth";

/**
 * Đẩy backup lên đám mây GitHub dưới dạng Gist riêng tư (không cần repo).
 * Cần biến GITHUB_TOKEN trong Keys của Convex (quyền "gist").
 * Được bot gọi sau khi lưu backup vào bảng guildBackups.
 */
export const githubPush = action({
  args: {
    guildId: v.string(),
    backupId: v.id("guildBackups"),
    backupJson: v.string(),
    guildName: v.optional(v.string()),
    /** Chìa khóa bot (botAuth) — chỉ bot có OWNER_SEED mới tính được. */
    botKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireBotKeyStrict(ctx, args.botKey);
    // Validate input trước khi đẩy lên GitHub: guildId là Discord snowflake.
    if (!/^\d{15,20}$/.test(args.guildId)) {
      return { ok: false, error: "guildId không hợp lệ" };
    }
    // Nội dung nén zlib (tiền tố "z:") giảm 60-80% — chấp nhận tới ~2.5 MB
    // (bung ra ~8 MB, khớp MAX_IMPORT_FILE_BYTES). JSON thuần chỉ tới 900 KB
    // (giới hạn file Gist 900KB của GitHub) — trước đây JSON lớn bị từ chối
    // với lỗi "GitHub lỗi 413" mà bot không giải thích được.
    const isCompressed = args.backupJson.startsWith("z:");
    const maxLen = isCompressed ? 2_500_000 : 900_000;
    if (!args.backupJson || args.backupJson.length > maxLen) {
      return {
        ok: false,
        error: isCompressed
          ? "Nội dung backup quá lớn hoặc rỗng (kể cả sau khi nén)"
          : "Nội dung backup quá lớn — hãy bật nén (bot bản mới tự nén) hoặc bỏ bớt tin nhắn/media",
      };
    }
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      return { ok: false, error: "GITHUB_TOKEN chưa được cấu hình trong Keys" };
    }
    const label = (args.guildName || args.guildId).slice(0, 60);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `protogon-backup-${args.guildId}-${stamp}${isCompressed ? ".zlib" : ""}.json`;
    let res: Response;
    try {
      res = await fetch("https://api.github.com/gists", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "User-Agent": "protogon-bot",
          Accept: "application/vnd.github+json",
        },
        body: JSON.stringify({
          description: `Protogon backup: ${label} (${new Date().toISOString()})`,
          public: false,
          files: { [filename]: { content: args.backupJson } },
        }),
        // TRẦN THỜI GIAN (đợt #3): gist chứa cả bản backup nên payload lớn, cho
        // 20s (rộng hơn các lời gọi khác). Không có trần thì GitHub treo là
        // action giữ kết nối tới trần Convex, bot tưởng đang sao lưu.
        signal: AbortSignal.timeout(20_000),
      });
    } catch (e) {
      return { ok: false, error: `Không kết nối được GitHub: ${(e as Error).message}` };
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        ok: false,
        error: `GitHub lỗi ${res.status}: ${text.slice(0, 200) || "xem log Convex"}`,
      };
    }
    const data = (await res.json()) as { html_url?: string };
    const url = data?.html_url;
    if (url) {
      // PHẢI chuyển tiếp botKey: botSetBackupGithub là mutation bảo mật cao,
      // requireBotKeyStrict sẽ từ chối khi thiếu key → gist đã tạo thành công
      // nhưng URL không lưu, dashboard báo "GitHub thất bại" oan.
      await ctx.runMutation(api.bot_writes.botSetBackupGithub, {
        backupId: args.backupId,
        url,
        botKey: args.botKey,
      });
    }
    return { ok: true, url: url ?? null, compressed: isCompressed };
  },
});
