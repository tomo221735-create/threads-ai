// Stripe API クライアント
// ドキュメント: https://docs.stripe.com/api

import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (_stripe) return _stripe;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY が設定されていません。");
  }

  _stripe = new Stripe(key);

  return _stripe;
}

// ---- Checkout Sessions ----
// https://docs.stripe.com/api/checkout/sessions/create
//
// カード情報の入力はStripeのホストされたCheckoutページで行うため、
// カード番号が自社サーバーを通過することはない＝PCI-DSSの対象範囲を最小化できる

export async function createSubscriptionCheckoutSession(params: {
  successUrl: string;
  cancelUrl: string;
  email?: string;
  planName: string;
  amount: number; // JPY, 最小単位（円をそのまま渡せばOK。JPYはゼロ decimal 通貨）
  metadata: Record<string, string>;
}): Promise<Stripe.Checkout.Session> {
  const stripe = getStripeClient();

  return stripe.checkout.sessions.create({
    mode: "subscription",
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    customer_email: params.email,
    line_items: [
      {
        price_data: {
          currency: "jpy",
          unit_amount: params.amount,
          recurring: { interval: "month" },
          product_data: {
            name: params.planName,
          },
        },
        quantity: 1,
      },
    ],
    metadata: params.metadata,
    subscription_data: {
      metadata: params.metadata,
    },
  });
}

export async function getCheckoutSession(
  sessionId: string
): Promise<Stripe.Checkout.Session> {
  const stripe = getStripeClient();
  return stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["subscription"],
  });
}

// ---- Subscriptions ----
// https://docs.stripe.com/api/subscriptions

export async function cancelSubscription(
  subscriptionId: string
): Promise<Stripe.Subscription> {
  const stripe = getStripeClient();
  return stripe.subscriptions.cancel(subscriptionId);
}

export async function getSubscription(
  subscriptionId: string
): Promise<Stripe.Subscription> {
  const stripe = getStripeClient();
  return stripe.subscriptions.retrieve(subscriptionId);
}

// ---- Webhook signature verification ----
// https://docs.stripe.com/webhooks#verify-events
// Stripe-Signature ヘッダーを使って検証する（SDKが内部でタイミングセーフ比較を行う）

export function constructWebhookEvent(
  rawBody: string,
  signatureHeader: string | null
): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secret) {
    throw new Error("STRIPE_WEBHOOK_SECRET が設定されていません。");
  }
  if (!signatureHeader) {
    throw new Error("Stripe-Signature ヘッダーがありません。");
  }

  const stripe = getStripeClient();
  return stripe.webhooks.constructEvent(rawBody, signatureHeader, secret);
}