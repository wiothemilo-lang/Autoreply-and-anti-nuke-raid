import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CalendarClock,
  ClipboardList,
  CloudUpload,
  DatabaseBackup,
  ExternalLink,
  FileUp,
  FolderTree,
  Github,
  Loader2,
  MessageSquare,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Smile,
  Sticker,
  Users,
} from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Switch } from "../ui/switch";
import type { GuildData, BackupInfo } from "../../lib/types";
import { MIN_IMPORT_BOT_VERSION } from "../../lib/constants";
import { getSessionToken } from "../../lib/discord";

import { dateLocale, translate } from "../../lib/i18n";
const TOKEN = () => getSessionToken();

/** "v47" → 47; "1.0.0"/khác → 0 (coi là bản cũ). */
function parseBotVersion(v: string | null): number {
  if (!v) return 0;
  const m = String(v).match(/^v?(\d+)/i);
  return m ? parseInt(m[1], 10) : 0;
}

/**
 * Chia các phần khôi phục thành "sẽ làm" / "bỏ qua". MỖI MỤC được dịch trọn
 * vẹn (tên phần, hoặc "bỏ qua <phần>") rồi mới ghép vào câu có placeholder —
 * nối mảnh câu tiếng Việt với nhau thì bản EN/DE đọc ra chữ Việt giữa câu.
 */
function splitRestoreParts(flags: {
  roles: boolean;
  emojis: boolean;
  channels: boolean;
  messages: boolean;
}): { applied: string[]; skipped: string[] } {
  const applied: string[] = [];
  const skipped: string[] = [];
  const put = (on: boolean, vi: string) => {
    if (on) applied.push(translate(vi));
    else skipped.push(translate("⏭️ bỏ qua {p0}", { p0: translate(vi) }));
  };
  put(flags.roles, "role");
  put(flags.emojis, "emoji/sticker");
  put(flags.channels, "các kênh");
  put(flags.messages, "tin nhắn");
  return { applied, skipped };
}

export default function BackupPanel({ data }: { data: GuildData }) {
  const [pushGithub, setPushGithub] = useState(true);
  const [includeMessages, setIncludeMessages] = useState(true);
  const [busy, setBusy] = useState<"backup" | string | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importFileName, setImportFileName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [refreshAt, setRefreshAt] = useState(0);
  const [autoOn, setAutoOn] = useState((data.guild.backupAutoDays ?? 0) > 0);
  const [autoDays, setAutoDays] = useState(
    Math.max(2, Math.min(30, data.guild.backupAutoDays ?? 7)),
  );
  const [autoBusy, setAutoBusy] = useState(false);
  /** Quy tắc giữ bản: N bản gần nhất + dọn theo tuổi (0 = tắt). Mặc định 3 bản. */
  const [keepCount, setKeepCount] = useState(
    Math.max(2, Math.min(50, data.guild.backupKeepCount ?? 3)),
  );
  const [keepDays, setKeepDays] = useState(
    Math.max(0, Math.min(365, data.guild.backupKeepDays ?? 0)),
  );
  const [retentionBusy, setRetentionBusy] = useState(false);
  /** Tùy chỉnh khôi phục: bật/tắt tạo lại role, emoji/sticker, kênh, tin nhắn khi restore (cả 2 nguồn). */
  const [restoreRoles, setRestoreRoles] = useState(data.guild.restoreRolesEnabled ?? true);
  const [restoreEmojis, setRestoreEmojis] = useState(data.guild.restoreEmojisEnabled ?? true);
  const [restoreMeta, setRestoreMeta] = useState(data.guild.restoreMetaEnabled ?? true);
  // Mặc định TẮT: cấm người + mở link mời không hoàn tác được.
  const [restoreExtras, setRestoreExtras] = useState(data.guild.restoreExtrasEnabled ?? false);
  const [restoreChannels, setRestoreChannels] = useState(data.guild.restoreChannelsEnabled ?? true);
  const [restoreMessages, setRestoreMessages] = useState(data.guild.restoreMessagesEnabled ?? true);
  const [restoreOptBusy, setRestoreOptBusy] = useState(false);
  /** Theo dõi trạng thái xử lý file import: null = không chờ, active = đang chờ bot. */
  const [importWatch, setImportWatch] = useState<null | { startedAt: number }>(null);
  const requestBackup = useMutation(api.backup.requestBackup);
  const requestRestore = useMutation(api.backup.requestRestore);
  const generateUploadUrl = useMutation(api.backup.generateImportUploadUrl);
  const requestImportRestore = useMutation(api.backup.requestImportRestore);
  const setAutoBackup = useMutation(api.backup.setAutoBackup);
  const setRetention = useMutation(api.backup.setRetention);
  const setRestoreOptions = useMutation(api.backup.setRestoreOptions);
  // Luôn theo dõi trạng thái import (reactive): hiện lỗi lần trước + chẩn đoán bot online/bản cũ.
  const importStatus = useQuery(api.backup.importStatus, {
    token: TOKEN(),
    guildId: data.guild.discordId,
  }) as
    | {
        requested: boolean;
        fileName: string | null;
        error: string | null;
        errorAt: number | null;
        restoreRequested: boolean;
        restoreError: string | null;
        restoreErrorAt: number | null;
        restoreFinishedAt: number | null;
        backupRequested: boolean;
        backupError: string | null;
        backupErrorAt: number | null;
        /** Mốc bot xử lý xong yêu cầu — so với lúc bấm để biết kết quả của lượt này. */
        backupFinishedAt: number | null;
        /** Backup vừa xong bị bỏ qua vì server không đổi (không tạo bản trùng). */
        backupUnchanged: boolean;
        botOnline: boolean;
        botVersion: string | null;
        botGuildCount: number;
        lastHeartbeat: number | null;
      }
    | null
    | undefined;
  // Theo dõi yêu cầu khôi phục (nút "Khôi phục vào server này") — bot xử lý xong
  // hoặc lỗi sẽ hiển thị ngay thay vì người dùng chờ không biết kết quả.
  const [restoreWatch, setRestoreWatch] = useState<null | { startedAt: number }>(null);
  /** Dry-run: bản backup đang xem kế hoạch (để chờ đúng kết quả của lượt bấm). */
  const [planBusy, setPlanBusy] = useState<string | null>(null);
  const requestRestorePlan = useMutation(api.backup.requestRestorePlan);
  const planStatus = useQuery(api.backup.restorePlanStatus, {
    token: TOKEN(),
    guildId: data.guild.discordId,
  }) as
    | {
        requested: boolean;
        backupId: string | null;
        plan: {
          guildName: string | null;
          createdAt: number | null;
          roleCount: number;
          channelCount: number;
          messageCount: number;
          emojiCount: number;
          stickerCount: number;
          settingsCount: number;
          warnings: string[];
          at: number;
        } | null;
        error: string | null;
        errorAt: number | null;
      }
    | null
    | undefined;

  // Bấm "Xem kế hoạch" — bot chỉ ĐỌC backup rồi báo sẽ tạo gì, không tạo gì cả.
  const askPlan = async (b: BackupInfo) => {
    setPlanBusy(b._id);
    try {
      await requestRestorePlan({
        token: TOKEN(),
        guildId: data.guild.discordId,
        backupId: b._id as Id<"guildBackups">,
      });
      toast.info(translate("Đang tính kế hoạch khôi phục…"), {
        description: translate(
          "Bot cần vài giây để đối chiếu backup với quyền hiện tại của server. Server chưa bị thay đổi.",
        ),
      });
    } catch (e) {
      toast.error(
        translate("Không xem được kế hoạch: {p0}", {
          p0: e instanceof Error ? e.message : String(e),
        }),
      );
    } finally {
      setPlanBusy(null);
    }
  };
  // Theo dõi yêu cầu backup (nút "Backup ngay") — bot báo lỗi sẽ toast ngay.
  const [backupWatch, setBackupWatch] = useState<null | { startedAt: number }>(null);

  const refresh = () => setRefreshAt((n) => n + 1);

  // Bot báo lỗi xử lý file import → hiện ngay lý do; xử lý xong → báo kết quả.
  useEffect(() => {
    if (!importWatch || importStatus === undefined || importStatus === null) return;
    if (importStatus.error) {
      toast.error(translate("Khôi phục từ file thất bại: {p0}", { p0: importStatus.error }), {
        description: translate("Hãy kiểm tra lại file backup hoặc tải lại file khác."),
      });
      setImportWatch(null);
    } else if (!importStatus.requested) {
      // Bot bản mới (v47+) xác nhận kết quả chính xác; bản cũ xóa cờ im lặng → chỉ nhắc kiểm tra.
      const fresh = parseBotVersion(importStatus.botVersion) >= MIN_IMPORT_BOT_VERSION;
      if (fresh) {
        toast.success(translate("Bot đã khôi phục xong backup từ file"), {
          description: translate(
            "Role, kênh, tin nhắn + media và emoji/sticker đã được tạo lại trên server.",
          ),
        });
      } else {
        toast.info(translate("Yêu cầu đã được xử lý xong"), {
          description: translate(
            "Bot đang chạy bản cũ ({p0}) nên không xác nhận được kết quả — hãy kiểm tra server trực tiếp và cập nhật bot lên bản mới nhất (v{p1}+) để nhận báo cáo chính xác.",
            { p0: importStatus.botVersion || translate("không rõ"), p1: MIN_IMPORT_BOT_VERSION },
          ),
        });
      }
      setImportWatch(null);
      window.setTimeout(refresh, 2500);
    }
  }, [importWatch, importStatus]);

  // Chờ quá 3 phút mà bot chưa xử lý → nhắc kiểm tra bot (không treo vô thời hạn).
  useEffect(() => {
    if (!importWatch) return;
    const timer = window.setTimeout(() => {
      if (Date.now() - importWatch.startedAt > 180_000) {
        const hint =
          importStatus?.botOnline === false
            ? translate(
                "Bot đang OFFLINE (không nhận được heartbeat) — hãy khởi động bot trên host rồi tải lại file.",
              )
            : importStatus?.botOnline === true
              ? translate(
                  "Bot online nhưng chưa xử lý — có thể bot đang chạy bản cũ, hãy cập nhật bot lên bản mới nhất rồi thử lại.",
                )
              : translate(
                  "Không xác định được trạng thái bot — hãy kiểm tra bot có online không (tab Giám sát bot).",
                );
        toast.warning(translate("Bot vẫn chưa xử lý file backup"), { description: hint });
        setImportWatch(null);
      }
    }, 180_000);
    return () => window.clearTimeout(timer);
  }, [importWatch, importStatus]);

  // Bot báo lỗi khôi phục / xử lý xong cờ restore → hiện ngay kết quả.
  // Quá 3 phút chưa xong → cảnh báo chẩn đoán (bot offline / bản cũ) thay vì treo.
  useEffect(() => {
    if (!restoreWatch || importStatus === undefined || importStatus === null) return;
    if (importStatus.restoreError) {
      toast.error(translate("Khôi phục thất bại: {p0}", { p0: importStatus.restoreError }), {
        description: translate(
          "Bot đã dừng giữa chừng. Kiểm tra bot còn trong server và đủ quyền Administrator rồi thử khôi phục lại.",
        ),
        duration: 12000,
      });
      setRestoreWatch(null);
      refresh();
    } else if (!importStatus.restoreRequested) {
      const fresh = parseBotVersion(importStatus.botVersion) >= MIN_IMPORT_BOT_VERSION;
      if (fresh) {
        toast.success(translate("Bot đã khôi phục xong"), {
          description: translate(
            "Role, kênh, tin nhắn và emoji/sticker đã được tạo lại theo backup. Kiểm tra embed xác nhận trong kênh log.",
          ),
        });
      } else {
        toast.info(translate("Yêu cầu khôi phục đã được xử lý"), {
          description: translate(
            "Bot đang chạy bản cũ ({p0}) — hãy kiểm tra server trực tiếp và cập nhật bot lên bản mới nhất (v{p1}+).",
            { p0: importStatus.botVersion || translate("không rõ"), p1: MIN_IMPORT_BOT_VERSION },
          ),
        });
      }
      setRestoreWatch(null);
      window.setTimeout(refresh, 2500);
    }
  }, [restoreWatch, importStatus]);

  // Kết quả của lượt "Backup ngay": lỗi → báo lý do; xong → báo ĐÃ TẠO BẢN MỚI
  // hay BỎ QUA vì server không đổi. Trước đây nhánh thành công im lặng hoàn toàn
  // nên người dùng bấm xong không thấy bản backup cũng không thấy thông báo nào.
  useEffect(() => {
    if (!backupWatch || importStatus === undefined || importStatus === null) return;
    if (importStatus.backupError) {
      toast.error(translate("Backup thất bại: {p0}", { p0: importStatus.backupError }), {
        description: translate(
          "Bot không lưu được bản backup. Đọc lý do ở khung đỏ phía trên, khắc phục rồi bấm Backup ngay lại.",
        ),
        duration: 12000,
      });
      setBackupWatch(null);
      refresh();
      return;
    }
    // Cờ còn treo = bot chưa tới lượt xử lý → tiếp tục chờ (banner "Đang tạo backup").
    if (importStatus.backupRequested) return;
    // So mốc thời gian để không nhầm với kết quả của lượt bấm trước đó.
    if ((importStatus.backupFinishedAt ?? 0) > backupWatch.startedAt) {
      if (importStatus.backupUnchanged) {
        toast.info(translate("Server không có thay đổi kể từ bản backup gần nhất"), {
          description: translate(
            'Bot không tạo bản trùng lặp. Bật "Kèm tin nhắn" hoặc chỉnh cấu trúc server rồi bấm Backup ngay lại nếu bạn cần một bản mới.',
          ),
          duration: 10000,
        });
      } else {
        toast.success(translate("Bot đã tạo xong bản backup mới"), {
          description: translate(
            "Bản backup mới đã có trong danh sách bên dưới và được lưu trên cloud.",
          ),
        });
      }
    }
    setBackupWatch(null);
    refresh();
  }, [backupWatch, importStatus]);

  // Chờ quá 4 phút mà bot chưa xử lý xong → cảnh báo chẩn đoán thay vì treo im lặng
  // (tick của bot là 180s; quá lâu thường là bot offline hoặc bot chạy bản cũ).
  useEffect(() => {
    if (!backupWatch) return;
    const timer = window.setTimeout(() => {
      if (Date.now() - backupWatch.startedAt > 240_000) {
        const hint =
          importStatus?.botOnline === false
            ? translate("Bot đang OFFLINE — khởi động bot trên host rồi bấm Backup ngay lại.")
            : translate(
                "Bot online nhưng chưa xử lý xong — server lớn kèm tin nhắn có thể mất vài phút; nếu quá lâu hãy cập nhật bot lên bản mới nhất.",
              );
        toast.warning(translate("Bot vẫn chưa xử lý xong yêu cầu backup"), {
          description: hint,
          duration: 10000,
        });
      }
    }, 240_000);
    return () => window.clearTimeout(timer);
  }, [backupWatch, importStatus]);

  // Restore chờ quá 3 phút → cảnh báo thay vì treo vô thời hạn.
  useEffect(() => {
    if (!restoreWatch) return;
    const timer = window.setTimeout(() => {
      if (Date.now() - restoreWatch.startedAt > 180_000) {
        const hint =
          importStatus?.botOnline === false
            ? translate("Bot đang OFFLINE — khởi động bot trên host rồi bấm Khôi phục lại.")
            : translate(
                "Bot online nhưng chưa xử lý xong — server lớn kèm tin nhắn có thể mất vài phút; nếu quá lâu hãy cập nhật bot lên bản mới nhất.",
              );
        toast.warning(translate("Bot vẫn chưa xử lý xong khôi phục"), {
          description: hint,
          duration: 10000,
        });
      }
    }, 180_000);
    return () => window.clearTimeout(timer);
  }, [restoreWatch, importStatus]);

  async function createBackup() {
    // Bot OFFLINE → yêu cầu sẽ không bao giờ được xử lý (bot quét mỗi ~20-60s);
    // cảnh báo NGAY thay vì để người dùng chờ vô ích và tưởng "backup hỏng".
    if (importStatus && importStatus.botOnline === false) {
      toast.error(translate("Bot đang OFFLINE — không thể backup lúc này"), {
        description: translate(
          "Bot không gửi heartbeat (offline hơn 3 phút). Hãy khởi động bot trên host (pm2 start protogon-bot / bật lại service) rồi bấm Backup ngay sau khi bot online.",
        ),
        duration: 8000,
      });
      return;
    }
    setBusy("backup");
    try {
      await requestBackup({
        token: TOKEN(),
        guildId: data.guild.discordId,
        pushToGithub: pushGithub,
        includeMessages,
      });
      // Copy cũ hứa "khoảng 20 giây" trong khi vòng tick của bot là 180s → người
      // dùng tưởng hỏng khi chưa thấy gì. Nói đúng thời gian chờ thật.
      toast.success(translate("Đã gửi yêu cầu tạo backup — bot xử lý trong khoảng 3 phút"), {
        description: pushGithub
          ? includeMessages
            ? translate(
                "Backup (kèm tin nhắn) sẽ được lưu trên Convex và đẩy lên GitHub (token của chủ bot — dùng chung mọi server).",
              )
            : translate(
                "Backup sẽ được lưu trên Convex và đẩy lên GitHub (token của chủ bot — dùng chung mọi server).",
              )
          : includeMessages
            ? translate("Backup (kèm tin nhắn) sẽ được lưu trên Convex.")
            : translate("Backup sẽ được lưu trên Convex."),
      });
      // Danh sách backup là query realtime nên tự cập nhật khi bot lưu xong; watch
      // chỉ để báo kết quả (tạo mới / không đổi / lỗi) và cảnh báo khi chờ quá lâu.
      setBackupWatch({ startedAt: Date.now() });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : translate("Thất bại"));
    } finally {
      setBusy(null);
    }
  }

  async function saveAuto() {
    setAutoBusy(true);
    try {
      await setAutoBackup({
        token: TOKEN(),
        guildId: data.guild.discordId,
        days: autoOn ? autoDays : 0,
      });
      toast.success(
        autoOn
          ? translate("Đã bật tự động backup mỗi {p0} ngày", { p0: autoDays })
          : translate("Đã tắt tự động backup"),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : translate("Thất bại"));
    } finally {
      setAutoBusy(false);
    }
  }

  async function saveRestoreOptions() {
    setRestoreOptBusy(true);
    try {
      await setRestoreOptions({
        token: TOKEN(),
        guildId: data.guild.discordId,
        restoreRoles,
        restoreChannels,
        restoreMessages,
        restoreEmojis,
        restoreMeta,
        restoreExtras,
      });
      const { applied, skipped } = splitRestoreParts({
        roles: restoreRoles,
        emojis: restoreEmojis,
        channels: restoreChannels,
        messages: restoreMessages,
      });
      toast.success(translate("Đã lưu tùy chỉnh khôi phục"), {
        description: skipped.length
          ? translate("Phần khôi phục: {p0} · BỎ QUA: {p1}.", {
              p0: applied.length ? applied.join(", ") : translate("không phần nào"),
              p1: skipped.join(", "),
            })
          : translate("Phần khôi phục: {p0} (tất cả).", { p0: applied.join(", ") }),
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : translate("Thất bại"));
    } finally {
      setRestoreOptBusy(false);
    }
  }

  async function importFile(file: File) {
    if (!file) return;
    if (file.size > 8_000_000) {
      toast.error(
        translate("File quá lớn (tối đa 8 MB) — hãy nén backup hoặc bỏ bớt media nặng rồi thử lại"),
      );
      return;
    }
    setImportBusy(true);
    try {
      // 1) Xin URL upload → 2) POST file thẳng lên Convex file storage (chấp nhận
      // file lớn hơn giới hạn document) → 3) chỉ lưu mã file + đặt yêu cầu khôi phục.
      const postUrl = await generateUploadUrl({
        token: TOKEN(),
        guildId: data.guild.discordId,
      });
      const res = await fetch(postUrl, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!res.ok) throw new Error(translate("Không tải file lên được — thử lại"));
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      if (!storageId) throw new Error(translate("Không nhận được mã file — thử lại"));
      await requestImportRestore({
        token: TOKEN(),
        guildId: data.guild.discordId,
        fileName: file.name,
        storageId,
      });
      toast.success(translate('Đã tải "{p0}" lên — bot đang xử lý', { p0: file.name }), {
        description: translate(
          "Bot tự nhận diện định dạng (JSON thường, base64 hoặc có lớp bọc), dựng lại kênh đúng thứ tự cùng role/emoji/sticker theo Tùy chỉnh khôi phục, rồi phục hồi tin nhắn kèm media (ảnh/video…). Lỗi (nếu có) sẽ hiện ngay khi bot báo lại.",
        ),
      });
      if (fileRef.current) fileRef.current.value = "";
      setImportFileName("");
      // Bắt đầu theo dõi: bot quét mỗi ~20s, server lớn có thể mất 1-2 phút.
      setImportWatch({ startedAt: Date.now() });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : translate("Tải file thất bại"));
    } finally {
      setImportBusy(false);
    }
  }

  async function restore(backup: BackupInfo) {
    // Bot OFFLINE → yêu cầu khôi phục sẽ nằm chờ vô hạn — chặn sớm với lý do rõ ràng.
    if (importStatus && importStatus.botOnline === false) {
      toast.error(translate("Bot đang OFFLINE — không thể khôi phục lúc này"), {
        description: translate(
          "Bot không gửi heartbeat. Hãy khởi động bot trên host rồi thử khôi phục lại sau khi bot online.",
        ),
        duration: 8000,
      });
      return;
    }
    const { applied, skipped } = splitRestoreParts({
      roles: restoreRoles,
      emojis: restoreEmojis,
      channels: restoreChannels,
      messages: restoreMessages,
    });
    // Câu xác nhận gồm nhiều đoạn: dịch RIÊNG TỪNG ĐOẠN rồi nối bằng xuống dòng
    // — không nhét "\n" vào trong key từ điển (key chứa escape \n rất dễ lọt
    // lưới check-i18n và khó đọc trong file dịch).
    const confirmText = [
      translate('Khôi phục backup của "{p0}" vào server hiện tại?', {
        p0: backup.guildName,
      }),
      translate(
        "Bot dựng lại cấu trúc theo backup (kênh đúng thứ tự, kèm role và emoji/sticker nếu backup có) rồi phục hồi tin nhắn cùng media (ảnh/video…), theo đúng Tùy chỉnh khôi phục bên dưới. Các role/kênh đang có của server này được giữ nguyên.",
      ),
      translate("Tùy chỉnh đang áp dụng: {p0}.", { p0: [...applied, ...skipped].join(", ") }),
    ].join("\n\n");
    if (!window.confirm(confirmText)) {
      return;
    }
    setBusy(backup._id);
    try {
      await requestRestore({
        token: TOKEN(),
        guildId: data.guild.discordId,
        backupId: backup._id,
      });
      setRestoreWatch({ startedAt: Date.now() });
      toast.success(translate("Đã yêu cầu khôi phục — bot thực hiện trong khoảng 1 phút"), {
        description: translate(
          "Role, quyền role và kênh sẽ được tạo lại theo backup. Kết quả sẽ hiện ở đây.",
        ),
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : translate("Thất bại"));
    } finally {
      setBusy(null);
    }
  }

  async function saveRetention() {
    setRetentionBusy(true);
    try {
      await setRetention({
        token: TOKEN(),
        guildId: data.guild.discordId,
        keepCount,
        keepDays,
      });
      toast.success(
        translate("Đã lưu quy tắc giữ bản: giữ {p0} bản gần nhất, xoá bản cũ hơn {p1} ngày.", {
          p0: keepCount,
          p1: keepDays,
        }),
        {
          description: translate(
            "Quy tắc có hiệu lực từ lần backup kế tiếp. Những bản đang có không bị xoá ngay.",
          ),
        },
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : translate("Thất bại"));
    } finally {
      setRetentionBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
          <DatabaseBackup className="h-5 w-5 text-primary" /> Backup server
        </h2>
        <p className="text-sm text-muted-foreground">
          {translate("Sao lưu cấu trúc server (role, quyền role, kênh và quyền kênh) lên")}{" "}
          <b className="text-foreground">{translate("đám mây GitHub")}</b>
          {translate(". Khi server bị nuke/raid phá sập hoàn toàn, hãy mời bot vào")}{" "}
          <b className="text-foreground">{translate("server phụ")}</b>{" "}
          {translate("rồi khôi phục lại từ backup.")}{" "}
        </p>

        {/* Lỗi backup gần nhất — bot báo lại thay vì im lặng */}
        {importStatus && importStatus.backupError && (
          <p className="mt-3 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              {translate("Lần backup trước")} <b>{translate("thất bại")}</b>:{" "}
              {importStatus.backupError} {translate("— khắc phục rồi bấm Backup ngay lại.")}
            </span>
          </p>
        )}
        {/* Yêu cầu đang chờ bot xử lý (bot quét mỗi ~3 phút) — nói rõ thay vì để
            bấm "Backup ngay" xong không thấy gì và tưởng tính năng hỏng. */}
        {importStatus && importStatus.backupRequested && (
          <p className="mt-3 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-primary">
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
            <span>
              {translate(
                "Đang tạo backup — bot quét yêu cầu mỗi khoảng 3 phút. Kết quả hiện ngay tại đây.",
              )}
            </span>
          </p>
        )}
        {/* Trạng thái khôi phục: lỗi lần trước / đang chạy — người dùng bấm
            "Khôi phục vào server này" xong PHẢI thấy kết quả, không chờ mù mờ. */}
        {importStatus && importStatus.restoreError && (
          <p className="mt-3 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              {translate("Lần khôi phục trước")} <b>{translate("thất bại")}</b>:{" "}
              {importStatus.restoreError}{" "}
              {translate(
                "— khắc phục (bot còn trong server, đủ quyền Administrator) rồi bấm Khôi phục lại.",
              )}
            </span>
          </p>
        )}
        {importStatus && importStatus.restoreRequested && (
          <p className="mt-3 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-primary">
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
            <span>
              {translate(
                "Đang khôi phục vào server này… server lớn kèm tin nhắn có thể mất vài phút. Kết quả hiện ở đây và trong kênh log.",
              )}{" "}
            </span>
          </p>
        )}
      </div>

      {/* Tạo backup */}
      <Card>
        <CardContent className="grid gap-4 p-4 sm:p-5 sm:grid-cols-[1fr_auto]">
          <div className="grid gap-3">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <CloudUpload className="h-5 w-5" />
              </span>
              <div>
                <p className="font-display font-semibold">
                  {translate("Tạo backup cho")} “{data.guild.name}”
                </p>
                <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                  {translate("Bot sao lưu toàn bộ")} <b className="text-foreground">role</b>{" "}
                  {translate("(tên, màu, hoist, mentionable, quyền),")}{" "}
                  <b className="text-foreground">{translate("kênh")}</b>{" "}
                  {translate("(danh mục, văn bản, thoại…) kèm quyền truy cập từng kênh, cùng")}{" "}
                  <b className="text-foreground">emoji + sticker</b>{" "}
                  {translate(
                    "và cấu hình cơ bản (prefix, từ ngữ xấu, role mod/admin, kênh log).",
                  )}{" "}
                </p>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex items-center justify-between gap-3 rounded-xl border border-border bg-secondary/50 px-3 py-2.5">
                <span className="flex items-center gap-2 text-sm">
                  <Github className="h-4 w-4" />
                  {translate("Đồng thời đẩy lên GitHub (Gist riêng tư)")}{" "}
                </span>
                <Switch checked={pushGithub} onCheckedChange={setPushGithub} />
              </label>
              <label className="flex items-center justify-between gap-3 rounded-xl border border-border bg-secondary/50 px-3 py-2.5">
                <span className="flex items-center gap-2 text-sm">
                  <MessageSquare className="h-4 w-4" />
                  {translate("Kèm tin nhắn và media (tối đa 50 tin/kênh)")}{" "}
                </span>
                <Switch checked={includeMessages} onCheckedChange={setIncludeMessages} />
              </label>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {translate(
                "Backup luôn được lưu trong Convex; đẩy lên GitHub giúp bạn còn giữ được dữ liệu ngay cả khi Convex bị xóa. Mọi server đều dùng chung",
              )}{" "}
              <code className="font-mono">GITHUB_TOKEN</code> {translate("của")}{" "}
              <b className="text-foreground">{translate("chủ sở hữu bot")}</b>{" "}
              {translate("(đã đặt trong Keys) — owner các server khác")}{" "}
              <b className="text-foreground">{translate("không cần tự dán token")}</b>{" "}
              {translate(
                "của họ. Nếu token chưa được cấu hình, phần GitHub bị bỏ qua và bot chỉ lưu trong Convex.",
              )}{" "}
            </p>
          </div>
          <div className="flex items-end">
            <Button size="lg" onClick={createBackup} disabled={busy !== null}>
              {busy === "backup" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> {translate("Đang yêu cầu…")}{" "}
                </>
              ) : (
                <>
                  <CloudUpload className="h-4 w-4" /> Backup ngay
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Khôi phục từ file backup của bot nuke (.msc / .json) */}
      <Card>
        <CardContent className="grid gap-4 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-foreground">
              <FileUp className="h-5 w-5" />
            </span>
            <div>
              <p className="font-display font-semibold">
                {translate("Khôi phục từ file backup của bot nuke (.msc / .json)")}{" "}
              </p>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                {translate("Nếu server bị")} <b className="text-foreground">bot nuke</b>{" "}
                {translate("phá sập mà bạn còn giữ được file backup của nó (định dạng")}{" "}
                <code className="font-mono">.msc</code> {translate("hoặc")}{" "}
                <code className="font-mono">.json</code>
                {translate("), tải file lên đây — bot sẽ")}{" "}
                <b className="text-foreground">{translate("nhận diện định dạng")}</b>{" "}
                {translate("(JSON thường / base64 / có lớp bọc), tạo lại")}{" "}
                <b className="text-foreground">{translate("role + kênh đúng thứ tự")}</b>{" "}
                {translate("như trong file, phục hồi")}{" "}
                <b className="text-foreground">{translate("tin nhắn")}</b>,{" "}
                <b className="text-foreground">{translate("đăng lại media")}</b>{" "}
                {translate("(ảnh/video…) và")}{" "}
                <b className="text-foreground">{translate("tạo lại emoji/sticker")}</b>{" "}
                {translate("nếu file có lưu.")}{" "}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept=".msc,.json,application/json"
              onChange={(e) => setImportFileName(e.target.files?.[0]?.name ?? "")}
              className="max-w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-sm file:font-medium file:text-foreground file:transition-colors hover:file:bg-secondary/80"
            />
            <Button
              onClick={() => {
                const f = fileRef.current?.files?.[0];
                if (f) void importFile(f);
              }}
              disabled={importBusy || !importFileName}
            >
              {importBusy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> {translate("Đang tải lên…")}{" "}
                </>
              ) : (
                <>
                  <FileUp className="h-4 w-4" /> {translate("Tải lên & khôi phục")}{" "}
                </>
              )}
            </Button>
          </div>
          {importWatch && (
            <div className="space-y-1.5 text-xs">
              <p className="flex items-center gap-2 text-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {translate(
                  "Đang chờ bot xử lý file — bot quét mỗi ~20 giây, server lớn có thể mất 1-2 phút. Lỗi (nếu có) sẽ hiện ngay tại đây.",
                )}{" "}
              </p>
              {importStatus?.botOnline === false && (
                <p className="flex items-center gap-2 text-danger">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  {translate(
                    "Bot đang OFFLINE — hãy khởi động bot trên host (Wispbyte…) rồi tải lại file.",
                  )}{" "}
                </p>
              )}
              {importStatus?.botOnline === true &&
                parseBotVersion(importStatus.botVersion) < MIN_IMPORT_BOT_VERSION && (
                  <p className="flex items-center gap-2 text-foreground">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    {translate(
                      "Bot đang chạy bản cũ ({version}) — cần cập nhật bot lên bản mới nhất (v{min}+) để khôi phục và báo kết quả chính xác.",
                      {
                        version: importStatus.botVersion ?? translate("không rõ"),
                        min: MIN_IMPORT_BOT_VERSION,
                      },
                    )}
                  </p>
                )}
            </div>
          )}
          {importStatus && importStatus.error && !importWatch && (
            <p className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                {translate("Lần thử trước")} <b>{translate("thất bại")}</b>: {importStatus.error}{" "}
                {translate("— kiểm tra lại file rồi tải lên.")}
              </span>
            </p>
          )}

          <p className="text-[11px] text-muted-foreground">
            {translate("Giới hạn file")} <b className="text-foreground">8 MB</b>{" "}
            {translate(
              "(gồm cả media — file lưu trên đám mây, không nhét vào bộ nhớ bot). Bot giữ nguyên role/kênh có sẵn của server hiện tại, chỉ thêm mới theo file chứ không xóa gì.",
            )}{" "}
          </p>
        </CardContent>
      </Card>

      {/* Tự động backup định kỳ (2-30 ngày) */}
      <Card className="border-border/70">
        <CardContent className="grid gap-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-foreground">
                <CalendarClock className="h-5 w-5" />
              </span>
              <div>
                <p className="font-display font-semibold">{translate("Tự động backup định kỳ")}</p>
                <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                  {translate("Bot tự sao lưu và đẩy lên")}{" "}
                  <b className="text-foreground">{translate("GitHub của chủ bot")}</b>{" "}
                  {translate("mỗi")} <b className="text-foreground">{translate("N ngày")}</b>{" "}
                  {translate("(tối thiểu")} <b>2</b>
                  {translate(", tối đa")} <b>30</b>
                  {translate("). Bot chỉ giữ")}{" "}
                  <b className="text-foreground">{translate("3 bản mới nhất")}</b>{" "}
                  {translate(
                    "trong bot — bản cũ hơn tự bị xóa, còn GitHub giữ bản lưu vĩnh viễn.",
                  )}{" "}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {autoOn ? (
                    data.guild.lastBackupAt ? (
                      <>
                        {translate("Backup gần nhất:")}{" "}
                        <b className="text-foreground">
                          {new Date(data.guild.lastBackupAt).toLocaleString(dateLocale(), {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </b>{" "}
                        {translate("· lần tới:")}{" "}
                        <b className="text-foreground">
                          {new Date(data.guild.lastBackupAt + autoDays * 86_400_000).toLocaleString(
                            dateLocale(),
                            {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            },
                          )}
                        </b>
                      </>
                    ) : (
                      translate(
                        "Bật lên là bot sao lưu bản đầu tiên trong khoảng 1 phút, sau đó lặp lại theo chu kỳ bạn chọn.",
                      )
                    )
                  ) : (
                    translate("Đang tắt — bot chỉ backup khi bạn bấm “Backup ngay” hoặc dùng lệnh.")
                  )}
                </p>
              </div>
            </div>
            <Switch checked={autoOn} onCheckedChange={setAutoOn} />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              {translate("Mỗi")}{" "}
              <input
                type="number"
                min={2}
                max={30}
                value={autoDays}
                disabled={!autoOn}
                onChange={(e) =>
                  setAutoDays(Math.max(2, Math.min(30, parseInt(e.target.value || "2", 10) || 2)))
                }
                className="h-9 w-20 rounded-lg border border-border bg-card px-2 text-center font-mono text-sm text-foreground outline-none focus:border-primary/60 disabled:opacity-40"
              />
              {translate("ngày")}{" "}
            </label>
            <Button size="sm" onClick={saveAuto} disabled={autoBusy}>
              {autoBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {translate("Lưu lịch tự động")}
            </Button>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-3">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              {translate("Giữ")}{" "}
              <input
                type="number"
                min={2}
                max={50}
                value={keepCount}
                onChange={(e) =>
                  setKeepCount(Math.max(2, Math.min(50, parseInt(e.target.value || "3", 10) || 3)))
                }
                className="h-9 w-20 rounded-lg border border-border bg-card px-2 text-center font-mono text-sm text-foreground outline-none focus:border-primary/60"
              />{" "}
              {translate("bản gần nhất")}{" "}
            </label>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              {translate("xoá bản cũ hơn")}{" "}
              <input
                type="number"
                min={0}
                max={365}
                value={keepDays}
                onChange={(e) =>
                  setKeepDays(Math.max(0, Math.min(365, parseInt(e.target.value || "0", 10) || 0)))
                }
                className="h-9 w-20 rounded-lg border border-border bg-card px-2 text-center font-mono text-sm text-foreground outline-none focus:border-primary/60"
              />{" "}
              {translate("ngày (0 = không xoá theo tuổi)")}{" "}
            </label>
            <Button size="sm" onClick={saveRetention} disabled={retentionBusy}>
              {retentionBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {translate("Lưu quy tắc giữ bản")}
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {translate(
              "Quy tắc này áp dụng cho các lần backup TIẾP THEO — bot xoá bản cũ ngay khi lưu bản mới, không xoá ngược lại những bản đang có.",
            )}{" "}
          </p>
        </CardContent>
      </Card>

      {/* Tùy chỉnh khôi phục: bật/tắt role + emoji/sticker (cả 2 nguồn backup) */}
      <Card className="border-border/70">
        <CardContent className="grid gap-4 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-foreground">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <p className="font-display font-semibold">{translate("Tùy chỉnh khôi phục")}</p>
              <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                {translate("Bật/tắt từng phần khi bot khôi phục — áp dụng cho")}{" "}
                <b className="text-foreground">{translate("cả backup của Protogon")}</b>{" "}
                {translate("lẫn")}{" "}
                <b className="text-foreground">{translate("file backup của bot nuke")}</b>{" "}
                {translate(
                  "(.msc/.json tải lên). Phần tắt sẽ được bỏ qua khi khôi phục (kênh, tin nhắn và media vẫn xử lý bình thường).",
                )}{" "}
              </p>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex items-center justify-between gap-3 rounded-xl border border-border bg-secondary/50 px-3 py-2.5">
              <span className="flex items-center gap-2 text-sm">
                <Users className="h-4 w-4" />
                {translate("Khôi phục role (tên, màu, quyền, thứ tự)")}{" "}
              </span>
              <Switch checked={restoreRoles} onCheckedChange={setRestoreRoles} />
            </label>
            <label className="flex items-center justify-between gap-3 rounded-xl border border-border bg-secondary/50 px-3 py-2.5">
              <span className="flex items-center gap-2 text-sm">
                <FolderTree className="h-4 w-4" />
                {translate("Khôi phục kênh (danh mục, văn bản, thoại…)")}{" "}
              </span>
              <Switch checked={restoreChannels} onCheckedChange={setRestoreChannels} />
            </label>
            <label className="flex items-center justify-between gap-3 rounded-xl border border-border bg-secondary/50 px-3 py-2.5">
              <span className="flex items-center gap-2 text-sm">
                <MessageSquare className="h-4 w-4" />
                {translate("Khôi phục tin nhắn + media")}{" "}
              </span>
              <Switch checked={restoreMessages} onCheckedChange={setRestoreMessages} />
            </label>
            <label className="flex items-center justify-between gap-3 rounded-xl border border-border bg-secondary/50 px-3 py-2.5">
              <span className="flex items-center gap-2 text-sm">
                <Smile className="h-4 w-4" />
                {translate("Khôi phục emoji / sticker")}{" "}
              </span>
              <Switch checked={restoreEmojis} onCheckedChange={setRestoreEmojis} />
            </label>
            <label className="flex items-center justify-between gap-3 rounded-xl border border-border bg-secondary/50 px-3 py-2.5">
              <span className="flex items-center gap-2 text-sm">
                <DatabaseBackup className="h-4 w-4" />
                {translate("Khôi phục tên / mô tả / icon server")}{" "}
              </span>
              <Switch checked={restoreMeta} onCheckedChange={setRestoreMeta} />
            </label>
            <label className="flex items-center justify-between gap-3 rounded-xl border border-danger/25 bg-danger/5 px-3 py-2.5">
              <span className="flex items-center gap-2 text-sm">
                <ShieldAlert className="h-4 w-4 text-danger" />
                <span>
                  {translate("Khôi phục danh sách ban + link mời")}{" "}
                  <span className="text-xs text-danger">({translate("không hoàn tác được")})</span>
                </span>
              </span>
              <Switch checked={restoreExtras} onCheckedChange={setRestoreExtras} />
            </label>
          </div>
          <div className="flex items-center gap-3">
            <Button size="sm" onClick={saveRestoreOptions} disabled={restoreOptBusy}>
              {restoreOptBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {translate("Lưu tùy chỉnh khôi phục")}
            </Button>
            {(data.guild.restoreRolesEnabled ?? true) !== restoreRoles ||
            (data.guild.restoreEmojisEnabled ?? true) !== restoreEmojis ||
            (data.guild.restoreChannelsEnabled ?? true) !== restoreChannels ||
            (data.guild.restoreMessagesEnabled ?? true) !== restoreMessages ||
            (data.guild.restoreMetaEnabled ?? true) !== restoreMeta ||
            (data.guild.restoreExtrasEnabled ?? false) !== restoreExtras ? (
              <span className="text-xs text-muted-foreground">
                {translate("Có thay đổi chưa lưu — bấm Lưu để áp dụng.")}{" "}
              </span>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* Danh sách backup — component con, remount theo refreshAt để ép tải lại */}
      <BackupListCard
        key={refreshAt}
        data={data}
        busy={busy}
        onRestore={restore}
        onRefresh={refresh}
        planBusy={planBusy}
        onPlan={askPlan}
      />

      <RestorePlanCard status={planStatus} />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4 text-xs leading-relaxed text-muted-foreground">
          <p className="mb-1 font-semibold text-foreground">
            {translate("🛡️ Khi bị nuke/raid phá sập")}
          </p>
          <p>{translate("1. Backup đã được đẩy lên GitHub từ trước → dữ liệu vẫn còn.")}</p>
          <p className="mt-1">{translate("2. Tạo server phụ, mời bot vào.")}</p>
          <p className="mt-1">
            {translate("3. Vào dashboard → server phụ → Backup → bấm “Khôi phục”.")}
          </p>
          <p className="mt-1">
            {translate(
              "4. Bot tạo lại role (tên, màu, quyền), danh mục, kênh + quyền truy cập và cấu hình cơ bản. Các role/kênh có sẵn của server phụ được giữ nguyên (không xóa gì).",
            )}{" "}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 text-xs leading-relaxed text-muted-foreground">
          <p className="mb-1 font-semibold text-foreground">{translate("☁️ Đám mây GitHub")}</p>
          <p>
            {translate("Mỗi backup tạo một")} <b>{translate("Gist riêng tư")}</b>{" "}
            {translate(
              "chứa file JSON cấu trúc server — bạn không cần tạo repo, không tốn bộ nhớ GitHub. Chỉ cần",
            )}{" "}
            <b className="text-foreground">{translate("một")}</b>{" "}
            <code className="font-mono">GITHUB_TOKEN</code> {translate("(quyền")}{" "}
            <code className="font-mono">gist</code>
            {translate(") của")} <b className="text-foreground">{translate("chủ sở hữu bot")}</b>{" "}
            {translate("đặt trong tab")} <b>Keys / API keys</b>{" "}
            {translate(
              "— mọi server dùng chung, các owner server khác không phải cấu hình gì. Số bản backup giữ lại theo quy tắc Giữ bản bên dưới (mặc định 3 bản mới nhất).",
            )}{" "}
          </p>
          <p className="mt-2">
            {translate("💡 Ngoài dashboard, bạn cũng có thể dùng lệnh trong Discord:")}{" "}
            <code className="font-mono">!backup</code> ·{" "}
            <code className="font-mono">!backup list</code> ·{" "}
            <code className="font-mono">{translate("!backup restore <số>")}</code>{" "}
            {translate("hoặc")} <code className="font-mono">/backup</code>.
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * KẾ HOẠCH khôi phục (dry-run) — kết quả bot trả về trước khi bấm "Khôi phục".
 * Cố ý nói rõ "chưa thay đổi gì": chủ server thấy đủ quyền, số lượng và cảnh
 * báo trước khi quyết định tạo hàng chục role/kênh không thể hoàn tác.
 */
function RestorePlanCard({
  status,
}: {
  status:
    | {
        requested: boolean;
        plan: {
          guildName: string | null;
          createdAt: number | null;
          roleCount: number;
          channelCount: number;
          messageCount: number;
          emojiCount: number;
          stickerCount: number;
          settingsCount: number;
          warnings: string[];
          at: number;
        } | null;
        error: string | null;
      }
    | null
    | undefined;
}) {
  if (!status || (!status.plan && !status.requested && !status.error)) return null;
  return (
    <Card className="border-primary/30">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-primary" />
          <p className="font-display font-semibold">
            {translate("Kế hoạch khôi phục (chưa thay đổi server)")}
          </p>
        </div>
        {status.requested && (
          <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {translate("Bot đang đối chiếu backup với server hiện tại…")}
          </p>
        )}
        {status.error && (
          <p className="mt-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {translate("Không tính được kế hoạch: {p0}", { p0: status.error })}
          </p>
        )}
        {status.plan && (
          <>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <Badge variant="secondary">
                <Users className="mr-1 h-3 w-3" />
                {status.plan.roleCount} {translate("role")}
              </Badge>
              <Badge variant="secondary">
                <FolderTree className="mr-1 h-3 w-3" />
                {status.plan.channelCount} {translate("kênh")}
              </Badge>
              <Badge variant="secondary">
                <MessageSquare className="mr-1 h-3 w-3" />
                {status.plan.messageCount} {translate("tin nhắn")}
              </Badge>
              <Badge variant="secondary">
                <Smile className="mr-1 h-3 w-3" />
                {status.plan.emojiCount} emoji
              </Badge>
              <Badge variant="secondary">
                <Sticker className="mr-1 h-3 w-3" />
                {status.plan.stickerCount} sticker
              </Badge>
              <Badge variant="secondary">
                {status.plan.settingsCount} {translate("mục cấu hình")}
              </Badge>
            </div>
            {status.plan.warnings.length > 0 ? (
              <ul className="mt-3 space-y-1.5 text-xs text-danger">
                {status.plan.warnings.map((w, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5" />
                {translate("Không phát hiện vấn đề gì — bot đủ quyền tạo lại cấu trúc này.")}
              </p>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              {translate(
                "Đây chỉ là kế hoạch — server chưa bị thay đổi. Bấm “Khôi phục vào server này” ở bản backup tương ứng để thực sự tạo lại.",
              )}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** Danh sách backup — component con để nút "Tải lại" remount (refetch) qua `key`. */
function BackupListCard({
  data,
  busy,
  onRestore,
  onRefresh,
  planBusy,
  onPlan,
}: {
  data: GuildData;
  busy: "backup" | string | null;
  onRestore: (backup: BackupInfo) => void;
  onRefresh: () => void;
  planBusy: string | null;
  onPlan: (backup: BackupInfo) => void;
}) {
  const backups = useQuery(api.backup.listMine, { token: TOKEN() }) as BackupInfo[] | undefined;

  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FolderTree className="h-4 w-4 text-primary" />
            <p className="font-display font-semibold">{translate("Backup có sẵn")}</p>
            <Badge variant="secondary">
              {(backups ?? []).length} {translate("bản")}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            {backups === undefined && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              title={translate("Tải lại danh sách backup")}
            >
              <RefreshCw className="h-3.5 w-3.5" /> {translate("Tải lại")}{" "}
            </Button>
          </div>
        </div>

        {backups && backups.length === 0 ? (
          <div className="mt-4 flex items-center gap-3 rounded-lg bg-secondary/40 px-3 py-3 text-sm text-muted-foreground">
            <ShieldCheck className="h-4 w-4" />
            {translate(
              "Chưa có backup nào — bấm “Backup ngay” phía trên để tạo bản đầu tiên.",
            )}{" "}
          </div>
        ) : (
          <div className="mt-4 space-y-2.5">
            {backups?.map((b) => (
              <div
                key={b._id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-secondary/50 px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{b.guildName}</p>
                    {b.guildId === data.guild.discordId ? (
                      <Badge variant="default" className="px-2 py-0.5 text-[10px]">
                        {translate("Server hiện tại")}{" "}
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="px-2 py-0.5 text-[10px]">
                        {translate("Server khác")}{" "}
                      </Badge>
                    )}
                    {b.pushedToGithub && (
                      <Badge className="gap-1 border border-border bg-secondary px-2 py-0.5 text-[10px] text-secondary-foreground">
                        <Github className="h-3 w-3" /> GitHub
                      </Badge>
                    )}
                    {b.source === "import" && (
                      <Badge className="gap-1 bg-foreground/10 px-2 py-0.5 text-[10px] text-foreground border border-foreground/20">
                        <FileUp className="h-3 w-3" /> {translate("Từ file")}{" "}
                      </Badge>
                    )}
                    {(b.emojiCount ?? 0) > 0 && (
                      <Badge className="gap-1 bg-foreground/10 px-2 py-0.5 text-[10px] text-foreground border border-foreground/20">
                        <Smile className="h-3 w-3" /> {b.emojiCount} emoji
                      </Badge>
                    )}
                    {(b.stickerCount ?? 0) > 0 && (
                      <Badge className="gap-1 bg-foreground/20 px-2 py-0.5 text-[10px] text-foreground border border-foreground/30">
                        <Sticker className="h-3 w-3" /> {b.stickerCount} sticker
                      </Badge>
                    )}
                    {(b.messageCount ?? 0) > 0 && (
                      <Badge className="gap-1 bg-foreground/10 px-2 py-0.5 text-[10px] text-foreground border border-foreground/20">
                        <MessageSquare className="h-3 w-3" /> {b.messageCount} tin
                      </Badge>
                    )}
                    {b.backupCompressed && (
                      <Badge className="gap-1 bg-foreground/10 px-2 py-0.5 text-[10px] text-foreground border border-foreground/20">
                        {translate("Nén")}{" "}
                      </Badge>
                    )}
                    {b.backupEncrypted && (
                      <Badge className="gap-1 border border-border bg-secondary px-2 py-0.5 text-[10px] text-secondary-foreground">
                        {translate("🔒 Mã hóa")}{" "}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    <span>
                      {new Date(b.createdAt).toLocaleString(dateLocale(), {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" /> {b.roleCount} role
                    </span>
                    <span className="flex items-center gap-1">
                      <FolderTree className="h-3 w-3" /> {b.channelCount} {translate("kênh")}
                    </span>
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {b.githubUrl && (
                    <a href={b.githubUrl} target="_blank" rel="noreferrer">
                      <Button variant="secondary" size="sm">
                        <ExternalLink className="h-3.5 w-3.5" /> Gist
                      </Button>
                    </a>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy !== null || planBusy !== null}
                    onClick={() => onPlan(b)}
                    title={translate("Xem trước sẽ tạo gì mà không thay đổi server (dry-run)")}
                  >
                    {planBusy === b._id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ClipboardList className="h-3.5 w-3.5" />
                    )}
                    {translate("Xem kế hoạch")}
                  </Button>
                  <Button
                    size="sm"
                    disabled={busy !== null}
                    onClick={() => onRestore(b)}
                    title={translate(
                      "Tạo lại role, quyền role và kênh của backup này trong server hiện tại",
                    )}
                  >
                    {busy === b._id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                    {translate("Khôi phục vào server này")}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
