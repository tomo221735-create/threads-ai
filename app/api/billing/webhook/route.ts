import { NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { constructWebhookEvent } from "@/lib/stripe";
import { PlanId } from "@/lib/plans";

// Stripe Webhook 受信エンドポイント
// https://docs.stripe.com/webhooks
//
// Stripeダッシュボード（Developers -> Webhooks）で、このURLを登録し、
// 以下のイベントを選択してください:
//   customer.subscription.updated / customer.subscription.deleted /
//   invoice.payment_failed
//
// 署名検証に使うsigning secretを、Webhook作成時に発行される値から
// 環境変数 STRIPE_WEBHOOK_SECRET に設定してください。

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("Stripe-Signature");

  let event: Stripe.Event;
  try {
    event = constructWebhookEvent(rawBody, signature);
  } catch (err) {
    console.error("Stripe webhook: 署名検証に失敗しました。", err);
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { error: dedupeError } = await supabase
    .from("stripe_webhook_events")
    .insert({ event_id: event.id, event_type: event.type });

  if (dedupeError) {
    if (dedupeError.code === "23505") {
      return NextResponse.json({ received: true, duplicate: true });
    }
    console.error("webhook dedupe insert error:", dedupeError);
  }

  try {
    switch (event.type) {
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const status =
          subscription.status === "active"
            ? "active"
            : subscription.status === "past_due" ||
              subscription.status === "unpaid"
            ? "retrying"
            : subscription.status === "canceled"
            ? "cancelled"
            : null;

        if (status === "active" || status === "retrying") {
          await handleSubscriptionActive(supabase, event, subscription, status);
        } else if (status === "cancelled") {
          await handleSubscriptionEnded(supabase, event, subscription, "cancelled");
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionEnded(supabase, event, subscription, "cancelled");
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionRef =
          invoice.parent?.type === "subscription_details"
            ? invoice.parent.subscription_details?.subscription
            : null;
        const subscriptionId =
          typeof subscriptionRef === "string"
            ? subscriptionRef
            : subscriptionRef?.id;

        if (subscriptionId) {
          const { getSubscription } = await import("@/lib/stripe");
          const subscription = await getSubscription(subscriptionId);
          await handleSubscriptionActive(supabase, event, subscription, "retrying");
        }
        break;
      }

      default: {
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("webhook processing error:", err, event.type);
    return NextResponse.json({ error: "processing error" }, { status: 500 });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BillingSupabase = SupabaseClient<any, any, any, any, any>;

async function handleSubscriptionActive(
  supabase: BillingSupabase,
  event: Stripe.Event,
  subscription: Stripe.Subscription,
  status: "active" | "retrying"
) {
  const metadata = subscription.metadata ?? {};
  const userId = metadata.user_id;
  const plan = metadata.plan as PlanId | undefined;

  if (!userId) {
    console.warn("subscription webhook: metadata.user_id が見つかりません。", event.id);
    return;
  }

  await supabase
    .from("profiles")
    .update({
      plan_status: status,
      ...(status === "active" && plan ? { plan } : {}),
      plan_updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  const item = subscription.items.data[0];

  await supabase.from("billing_events_log").insert({
    user_id: userId,
    event_type: event.type,
    plan: plan ?? null,
    stripe_subscription_id: subscription.id,
    amount: item?.price.unit_amount ?? null,
    currency: item?.price.currency?.toUpperCase() ?? null,
    raw: subscription as unknown as Record<string, unknown>,
  });
}

async function handleSubscriptionEnded(
  supabase: BillingSupabase,
  event: Stripe.Event,
  subscription: Stripe.Subscription,
  status: "suspended" | "cancelled"
) {
  const metadata = subscription.metadata ?? {};
  const userId = metadata.user_id;

  if (!userId) {
    console.warn("subscription webhook: metadata.user_id が見つかりません。", event.id);
    return;
  }

  await supabase
    .from("profiles")
    .update({
      plan: "free",
      plan_status: status,
      stripe_subscription_id: null,
      plan_updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  await supabase.from("billing_events_log").insert({
    user_id: userId,
    event_type: event.type,
    plan: "free",
    stripe_subscription_id: subscription.id,
    raw: subscription as unknown as Record<string, unknown>,
  });
}