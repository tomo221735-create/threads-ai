import { NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { verifyKomojuSignature, KomojuWebhookEvent } from "@/lib/komoju";
import { PlanId } from "@/lib/plans";

// KOMOJU Webhook 受信エンドポイント
// https://doc.komoju.com/docs/webhooks
//
// KOMOJUダッシュボード（Manage -> Webhooks）で、このURLを登録し、
// 以下のイベントを選択してください:
//   subscription.created / subscription.captured / subscription.failed /
//   subscription.suspended / subscription.deleted
//
// 署名検証に使う secret token は、Webhook作成時に設定した値を
// 環境変数 KOMOJU_WEBHOOK_SECRET に設定してください。

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("X-Komoju-Signature");

  const isValid = await verifyKomojuSignature(rawBody, signature);

  if (!isValid) {
    console.error("KOMOJU webhook: 署名検証に失敗しました。");
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  let event: KomojuWebhookEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 冪等性の担保: KOMOJUは配信失敗時に最大25回再送してくるため、
  // 同じevent.idを二重処理しないようにする。
  const { error: dedupeError } = await supabase
    .from("komoju_webhook_events")
    .insert({ event_id: event.id, event_type: event.type });

  if (dedupeError) {
    // unique制約違反 = 処理済みのイベント。200を返して再送を止める。
    if (dedupeError.code === "23505") {
      return NextResponse.json({ received: true, duplicate: true });
    }
    console.error("webhook dedupe insert error:", dedupeError);
  }

  try {
    switch (event.type) {
      case "ping": {
        break;
      }

      case "subscription.captured": {
        await handleSubscriptionActive(supabase, event, "active");
        break;
      }

      case "subscription.failed": {
        await handleSubscriptionActive(supabase, event, "retrying");
        break;
      }

      case "subscription.suspended": {
        await handleSubscriptionEnded(supabase, event, "suspended");
        break;
      }

      case "subscription.deleted": {
        await handleSubscriptionEnded(supabase, event, "cancelled");
        break;
      }

      default: {
        // 未対応イベントはログのみ
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("webhook processing error:", err, event.type);
    // 500を返すとKOMOJU側が再送してくれるため、一時的な障害はここで拾える
    return NextResponse.json({ error: "processing error" }, { status: 500 });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BillingSupabase = SupabaseClient<any, any, any, any, any>;

async function handleSubscriptionActive(
  supabase: BillingSupabase,
  event: KomojuWebhookEvent,
  status: "active" | "retrying"
) {
  const data = event.data as {
    id?: string;
    status?: string;
    amount?: number;
    currency?: string;
    metadata?: Record<string, string>;
  };

  const userId = data.metadata?.user_id;
  const plan = data.metadata?.plan as PlanId | undefined;

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

  await supabase.from("billing_events_log").insert({
    user_id: userId,
    event_type: event.type,
    plan: plan ?? null,
    komoju_subscription_id: data.id ?? null,
    amount: data.amount ?? null,
    currency: data.currency ?? null,
    raw: event.data,
  });
}

async function handleSubscriptionEnded(
  supabase: BillingSupabase,
  event: KomojuWebhookEvent,
  status: "suspended" | "cancelled"
) {
  const data = event.data as {
    id?: string;
    metadata?: Record<string, string>;
  };

  const userId = data.metadata?.user_id;

  if (!userId) {
    console.warn("subscription webhook: metadata.user_id が見つかりません。", event.id);
    return;
  }

  await supabase
    .from("profiles")
    .update({
      plan: "free",
      plan_status: status,
      komoju_subscription_id: null,
      plan_updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  await supabase.from("billing_events_log").insert({
    user_id: userId,
    event_type: event.type,
    plan: "free",
    komoju_subscription_id: data.id ?? null,
    raw: event.data,
  });
}