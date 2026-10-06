"use node";

/// <reference types="node" />

/** Minimal env typing để file này type-check cả từ Vite app (theo backup_github.ts). */
declare const process: {
  env: Record<string, string | undefined>;
};

/**
 * paymentsAction — các action ZaloPay chạy trên Node runtime (cần process.env
 * để đọc key; Convex mặc định runtime KHÔNG expose env — xem botAuth.ts).
 *
 *   startPayment  — tạo đơn (giết giá bên payments.createIntentInternal) + ký
 *                   MAC key1 + gọi ZaloPay create → trả paymentUrl để redirect.
 *   queryOrder    — trang trả về TRUY VẤN lại trạng thái (không tin ?order=);
 *                   callback bị lỡ thì query vẫn chốt được tiền.
 *   handleCallback— ZaloPay IPN: verify MAC key2 rồi markPaidInternal (đi qua
 *                   convex/http.ts vì httpAction cần nằm ở file default runtime).
 *
 * Bí mật KHÔNG BAO GIỜ xuất hiện trong error trả client: mọi thông điệp ném
 * ra đều là tiếng Việt chung chung; chi tiết API chỉ ghi vào payments.error.
 */
import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  createOrderMacHex,
  dashboardOrigin,
  paymentDescription,
  queryOrderMacHex,
  verifyCallbackMacHex,
} from "./payments";

type OrderConfig = { appId: string; key1: string; baseUrl: string };

/**
 * Kiểu kết quả khai TƯỜNG MINH — không để TS suy đoán qua `internal`:
 * api.d.ts chứa module http (http.ts cũng dùng `internal`) nên suy đoán thân
 * action gọi internal sẽ thành vòng (TS7022/TS7023) — annotation cắt vòng.
 */
type StartPaymentResult = { paymentUrl: string; appTransId: string; amount: number };
type QueryOrderResult = {
  status: "pending" | "paid" | "failed" | "expired";
  kind: "donate" | "premium";
  plan: string;
  amount: number;
};
type CallbackResult = { returnCode: number; message: string };
type IntentInfo = {
  paymentId: string;
  appTransId: string;
  amount: number;
  kind: "donate" | "premium";
  plan: string;
  discordId: string;
  createdAt: number;
};
type OwnedOrder = {
  paymentId: string;
  appTransId: string;
  amount: number;
  kind: "donate" | "premium";
  plan: string;
  status: "pending" | "paid" | "failed" | "expired";
  createdAt: number;
};

/**
 * Cấu hình ZaloPay — MẶC ĐỊNH sandbox (không bao giờ chạm tiền thật khi thiếu
 * cờ). Đổi sang live bằng biến ZALOPAY_MODE=live (xem docs/zalopay-integration.md).
 */
function readConfig(): OrderConfig {
  const appId = process.env.ZALOPAY_APP_ID;
  const key1 = process.env.ZALOPAY_KEY1;
  if (!appId || !key1) {
    throw new Error(
      "Cổng thanh toán chưa được cấu hình — thiếu ZALOPAY_APP_ID/ZALOPAY_KEY1. Liên hệ admin để mở.",
    );
  }
  const live = process.env.ZALOPAY_MODE === "live";
  return {
    appId,
    key1,
    baseUrl: live ? "https://openapi.zalopay.vn" : "https://sb-openapi.zalopay.vn",
  };
}

/** POST JSON tới ZaloPay với timeout — trả data đã parse hoặc ném lỗi mạng. */
async function postZaloPay(baseUrl: string, path: string, body: Record<string, unknown>) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  return (await res.json()) as Record<string, unknown>;
}

/**
 * Tạo đơn + trả URL thanh toán. Gọi MỘT bước: intent được tạo ngay trước khi
 * ký MAC nên app_time luôn fresh (ZaloPay bắt buộc ≤15 phút) và không bao giờ
 * tái sử dụng đơn cũ.
 */
export const startPayment = action({
  args: {
    token: v.string(),
    kind: v.union(v.literal("donate"), v.literal("premium")),
    plan: v.string(),
    customAmount: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<StartPaymentResult> => {
    const cfg = readConfig();
    const intent: IntentInfo = await ctx.runMutation(internal.payments.createIntentInternal, {
      token: args.token,
      kind: args.kind,
      plan: args.plan,
      customAmount: args.customAmount,
    });

    // Trả về sau khi thanh toán: trang /donate|/premium?order=<appTransId>.
    // Thiếu DASHBOARD_URL/OAUTH_REDIRECT_URI → bỏ redirecturl, ZaloPay dùng
    // URL đã đăng ký trong portal (docs/troubleshooting ghi ở doc tích hợp).
    const origin = dashboardOrigin(process.env.DASHBOARD_URL, process.env.OAUTH_REDIRECT_URI);
    const embedData = JSON.stringify(origin ? { redirecturl: `${origin}/${intent.kind}` } : {});
    const item = "[]";
    const appTime = Date.now();
    const mac = createOrderMacHex(cfg.key1, {
      appId: cfg.appId,
      appTransId: intent.appTransId,
      appUser: intent.discordId,
      amount: intent.amount,
      appTime,
      embedData,
      item,
    });
    const site = process.env.CONVEX_SITE_URL;
    const body: Record<string, unknown> = {
      app_id: Number(cfg.appId),
      app_user: intent.discordId,
      app_trans_id: intent.appTransId,
      app_time: appTime,
      expire_duration_seconds: 900,
      amount: intent.amount,
      description: paymentDescription(intent.kind, intent.plan, intent.appTransId),
      item,
      embed_data: embedData,
      bank_code: "",
      mac,
      ...(site ? { callback_url: `https://${site}/zalopay/callback` } : {}),
    };

    let data: Record<string, unknown>;
    try {
      data = await postZaloPay(cfg.baseUrl, "/v2/create", body);
    } catch (e) {
      await ctx.runMutation(internal.payments.recordErrorInternal, {
        appTransId: intent.appTransId,
        error: `create: không gọi được ZaloPay (${String(e).slice(0, 120)})`,
      });
      throw new Error("Không kết nối được ZaloPay — thử lại sau ít phút nhé.");
    }
    if (data && data.return_code === 1 && data.order_url) {
      return {
        paymentUrl: String(data.order_url),
        appTransId: intent.appTransId,
        amount: intent.amount,
      };
    }
    const detail = String(data?.return_message || data?.sub_return_message || "lỗi không rõ");
    await ctx.runMutation(internal.payments.recordErrorInternal, {
      appTransId: intent.appTransId,
      error: `create ${String(data?.return_code)}: ${detail}`,
    });
    throw new Error(`ZaloPay từ chối tạo đơn (${detail}). Thử lại sau ít phút.`);
  },
});

/**
 * Truy vấn trạng thái đơn — trang trả về gọi sau khi quay lại. Đã paid trong
 * DB thì trả ngay, không gọi API; còn pending thì hỏi ZaloPay và chốt tiền
 * nếu callback bị lỡ (khuyến nghị "Option 2" trong docs ZaloPay).
 */
export const queryOrder = action({
  args: { token: v.string(), appTransId: v.string() },
  handler: async (ctx, args): Promise<QueryOrderResult> => {
    const order: OwnedOrder | null = await ctx.runQuery(internal.payments.getOwnedOrderByRef, {
      token: args.token,
      appTransId: args.appTransId,
    });
    if (!order) throw new Error("Không tìm thấy đơn thanh toán (hoặc đơn không thuộc bạn).");
    if (order.status !== "pending") {
      return { status: order.status, kind: order.kind, plan: order.plan, amount: order.amount };
    }

    let cfg: OrderConfig;
    try {
      cfg = readConfig();
    } catch {
      // Chưa cấu hình → đúng sự thật: đơn vẫn chờ, không tự chốt.
      return {
        status: "pending" as const,
        kind: order.kind,
        plan: order.plan,
        amount: order.amount,
      };
    }

    let data: Record<string, unknown>;
    try {
      data = await postZaloPay(cfg.baseUrl, "/v2/query", {
        app_id: Number(cfg.appId),
        app_trans_id: order.appTransId,
        mac: queryOrderMacHex(cfg.key1, cfg.appId, order.appTransId),
      });
    } catch {
      return {
        status: "pending" as const,
        kind: order.kind,
        plan: order.plan,
        amount: order.amount,
      };
    }

    if (data && data.return_code === 1) {
      const amountPaid = Number(data.amount);
      await ctx.runMutation(internal.payments.markPaidInternal, {
        appTransId: order.appTransId,
        amountPaid: Number.isFinite(amountPaid) && amountPaid > 0 ? amountPaid : order.amount,
        zpTransId: data.zp_trans_id !== undefined ? String(data.zp_trans_id) : undefined,
        source: "query",
      });
      return { status: "paid" as const, kind: order.kind, plan: order.plan, amount: order.amount };
    }
    if (data && data.return_code === 2) {
      // 2 = chưa thanh toán / chưa xong — vẫn là pending.
      return {
        status: "pending" as const,
        kind: order.kind,
        plan: order.plan,
        amount: order.amount,
      };
    }
    return { status: "pending" as const, kind: order.kind, plan: order.plan, amount: order.amount };
  },
});

/**
 * Nhận IPN từ ZaloPay (goi qua http.ts). Trả {return_code:1} chỉ khi MAC key2
 * hợp lệ VÀ đã ghi được DB; sai MAC trả 2 để ZaloPay biết không phải tiền thật.
 */
export const handleCallback = internalAction({
  args: { data: v.string(), mac: v.string(), type: v.number() },
  handler: async (ctx, args): Promise<CallbackResult> => {
    if (args.type !== 1) return { returnCode: 1, message: "ignored" };
    const key2 = process.env.ZALOPAY_KEY2;
    if (!key2) return { returnCode: 2, message: "not configured" };
    if (!verifyCallbackMacHex(args.data, args.mac, key2)) {
      return { returnCode: 2, message: "mac not equal" };
    }
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(args.data) as Record<string, unknown>;
    } catch {
      return { returnCode: 2, message: "bad data" };
    }
    const appTransId = String(payload.app_trans_id || "");
    if (!appTransId) return { returnCode: 2, message: "missing app_trans_id" };
    const amountRaw = Number(payload.amount);
    const res: { ok: boolean; reason?: string } = await ctx.runMutation(
      internal.payments.markPaidInternal,
      {
        appTransId,
        // NaN → -1: ghi nhận tiền thật (MAC đã verify) nhưng note lệch để đối soát.
        amountPaid: Number.isFinite(amountRaw) ? amountRaw : -1,
        zpTransId: payload.zp_trans_id !== undefined ? String(payload.zp_trans_id) : undefined,
        source: "callback",
      },
    );
    if (!res.ok) return { returnCode: 2, message: res.reason || "order error" };
    return { returnCode: 1, message: "success" };
  },
});
