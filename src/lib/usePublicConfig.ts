import { useEffect, useState } from "react";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { pickValidClientId } from "./discord";

/**
 * Cache dùng chung toàn app cho publicConfig (action — tốn hạn mức hơn query).
 * Trước đây mỗi component mount đều gọi lại action → mở 1 trang landing là
 * 3-4 lần gọi liên tiếp. Giờ chỉ gọi MỘT lần trong 10 phút cho cả ứng dụng.
 */
interface PublicConfig {
  clientId: string;
  discordInvite: string;
  facebookUrl: string;
}

/**
 * Client ID nướng vào bundle lúc build chỉ là fallback khởi tạo. Backend vẫn
 * được hỏi để nhận ID đang hoạt động; nhờ vậy đổi/xoay Discord Application không
 * cần rebuild toàn bộ dashboard nếu Convex đã cập nhật.
 */
const BAKED_CLIENT_ID: string =
  (import.meta.env.VITE_DISCORD_CLIENT_ID as string | undefined) ?? "";

const FALLBACK: PublicConfig = {
  clientId: pickValidClientId(BAKED_CLIENT_ID),
  discordInvite: "https://discord.gg/rftv",
  facebookUrl: "https://www.facebook.com/profile.php?id=61592820547312",
};

const CACHE_TTL_MS = 10 * 60_000;

type ConfigResult = { data: PublicConfig; error: boolean };
let cache: { data: PublicConfig; at: number } | null = null;
let inflight: Promise<ConfigResult> | null = null;

export async function fetchPublicConfig(
  load: () => Promise<(Partial<PublicConfig> & { rateLimited?: boolean }) | null>,
): Promise<ConfigResult> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return { data: cache.data, error: false };
  if (!inflight) {
    inflight = load()
      .then((res) => {
        const data: PublicConfig = {
          // Chỉ nhận snowflake hợp lệ — giá trị rác (blob mã hóa dán nhầm, chữ,
          // khoảng trắng…) bị loại thay vì đưa vào URL ủy quyền Discord.
          clientId: pickValidClientId(res?.clientId, BAKED_CLIENT_ID),
          discordInvite: res?.discordInvite ?? FALLBACK.discordInvite,
          facebookUrl: res?.facebookUrl ?? FALLBACK.facebookUrl,
        };
        // Phản hồi mặc định do giới hạn tần suất chỉ dùng cho lần nạp này.
        if (res?.rateLimited) return { data: cache?.data ?? data, error: false };
        cache = { data, at: Date.now() };
        return { data, error: false };
      })
      .catch(() => {
        const data = cache?.data ?? FALLBACK;
        return { data, error: !data.clientId };
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/**
 * Loads the public Discord Client ID (from env) once — deduped across the app.
 *
 * `error` is true when the backend could not be reached at all (so the caller
 * can show a "server unreachable" message instead of blaming a missing
 * Client ID).
 */
export function usePublicConfig(): {
  clientId: string;
  discordInvite: string;
  facebookUrl: string;
  loading: boolean;
  error: boolean;
} {
  const load = useAction(api.public.publicConfig);
  const [config, setConfig] = useState<PublicConfig | null>(
    () => cache?.data ?? (FALLBACK.clientId ? FALLBACK : null),
  );
  const [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    fetchPublicConfig(load).then((res) => {
      if (!alive) return;
      setError(res.error);
      setConfig(res.data);
    });
    return () => {
      alive = false;
    };
  }, [load]);
  return {
    ...(config ?? FALLBACK),
    loading: config === null,
    error,
  };
}
