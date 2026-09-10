// KOMOJU API クライアント
// ドキュメント: https://doc.komoju.com/
//
// 認証: HTTP Basic認証。ユーザー名 = シークレットキー、パスワードは空。
// https://doc.komoju.com/docs/authentication

const KOMOJU_API_BASE = "https://komoju.com/api/v1";

function getSecretKey(): string {
  const key = process.env.KOMOJU_SECRET_KEY;
  if (!key) {
    throw new Error("KOMOJU_SECRET_KEY が設定されていません。");
  }
  return key;
}

function authHeader(): string {
  // Basic認証: "secret_key:" をBase64エンコード（パスワードなし）
  const token = Buffer.from(`${getSecretKey()}:`).toString("base64");
  return `Basic ${token}`;
}

export class KomojuError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "KomojuError";
    this.status = status;
    this.body = body;
  }
}

async function komojuFetch<T>(
  path: string,
  init: RequestInit & { formBody?: Record<string, string | number | undefined> } = {}
): Promise<T> {
  const { formBody, ...rest } = init;

  const headers: Record<string, string> = {
    Authorization: authHeader(),
    ...(rest.headers as Record<string, string> | undefined),
  };

  let body: string | undefined;

  if (formBody) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(formBody)) {
      if (value !== undefined && value !== null) {
        params.append(key, String(value));
      }
    }
    body = params.toString();
    headers["Content-Type"] = "application/x-www-form-urlencoded";
  }

  const res = await fetch(`${KOMOJU_API_BASE}${path}`, {
    ...rest,
    headers,
    body: body ?? rest.body,
  });

  const text = await res.text();
  const json = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new KomojuError(
      `KOMOJU API error (${res.status}): ${path}`,
      res.status,
      json
    );
  }

  return json as T;
}

// ---- Sessions ----
// https://doc.komoju.com/reference/createsession
// https://doc.komoju.com/reference/showsession

export type KomojuSession = {
  id: string;
  resource: "session";
  mode: "payment" | "customer" | "customer_payment";
  status: "pending" | "completed" | "cancelled" | "expired";
  session_url: string;
  return_url: string;
  customer_id: string | null;
  metadata: Record<string, string>;
  created_at: string;
  completed_at: string | null;
  cancelled_at: string | null;
};

export async function createCustomerSession(params: {
  returnUrl: string;
  email?: string;
  metadata?: Record<string, string>;
}): Promise<KomojuSession> {
  const formBody: Record<string, string> = {
    mode: "customer",
    return_url: params.returnUrl,
  };

  if (params.email) formBody.email = params.email;

  if (params.metadata) {
    for (const [key, value] of Object.entries(params.metadata)) {
      formBody[`metadata[${key}]`] = value;
    }
  }

  return komojuFetch<KomojuSession>("/sessions", {
    method: "POST",
    formBody,
  });
}

export async function getSession(sessionId: string): Promise<KomojuSession> {
  return komojuFetch<KomojuSession>(`/sessions/${sessionId}`, {
    method: "GET",
  });
}

// ---- Subscriptions ----
// https://doc.komoju.com/reference/subscriptions
// https://doc.komoju.com/reference/createsubscription
// https://doc.komoju.com/reference/deletesubscription

export type KomojuSubscriptionStatus =
  | "pending"
  | "active"
  | "retrying"
  | "suspended"
  | "deleted";

export type KomojuSubscription = {
  id: string;
  resource: "subscription";
  status: KomojuSubscriptionStatus;
  amount: number;
  currency: string;
  period: "weekly" | "monthly" | "yearly";
  customer: string | { id: string };
  metadata: Record<string, string>;
  next_capture_at: string | null;
  ended_at: string | null;
  retry_count: number;
  retry_at: string | null;
};

export async function createSubscription(params: {
  customerId: string;
  amount: number;
  currency?: string;
  period?: "weekly" | "monthly" | "yearly";
  metadata?: Record<string, string>;
}): Promise<KomojuSubscription> {
  const formBody: Record<string, string> = {
    customer: params.customerId,
    amount: String(params.amount),
    currency: params.currency ?? "JPY",
    period: params.period ?? "monthly",
  };

  if (params.metadata) {
    for (const [key, value] of Object.entries(params.metadata)) {
      formBody[`metadata[${key}]`] = value;
    }
  }

  return komojuFetch<KomojuSubscription>("/subscriptions", {
    method: "POST",
    formBody,
  });
}

export async function deleteSubscription(subscriptionId: string): Promise<void> {
  await komojuFetch<unknown>(`/subscriptions/${subscriptionId}`, {
    method: "DELETE",
  });
}

export async function getSubscription(
  subscriptionId: string
): Promise<KomojuSubscription> {
  return komojuFetch<KomojuSubscription>(`/subscriptions/${subscriptionId}`, {
    method: "GET",
  });
}

// ---- Webhook signature verification ----
// https://doc.komoju.com/docs/webhooks
// X-Komoju-Signature = HMAC-SHA256(secretToken, rawBody) のhex文字列

export async function verifyKomojuSignature(
  rawBody: string,
  signatureHeader: string | null
): Promise<boolean> {
  const secret = process.env.KOMOJU_WEBHOOK_SECRET;

  if (!secret || !signatureHeader) return false;

  const crypto = await import("crypto");
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);

  if (a.length !== b.length) return false;

  return crypto.timingSafeEqual(a, b);
}

export type KomojuWebhookEvent = {
  id: string;
  type: string;
  resource: "event";
  data: Record<string, unknown> & { id?: string; metadata?: Record<string, string> };
  created_at: string;
};