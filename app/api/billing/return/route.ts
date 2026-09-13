import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCheckoutSession, cancelSubscription } from "@/lib/stripe";
import { PLANS, PlanId } from "@/lib/plans";

// Stripe Checkoutの決済完了後、success_url に
// ?session_id=xxxx が付与されてブラウザがリダイレクトされてくる。
// https://docs.stripe.com/checkout/embedded/quickstart#handle-post-checkout-events
//
// 正式な状態確定はwebhook側（checkout.session.completed等）で行うが、
// UX上ここでも即時反映を試みる（冪等なので二重に処理されても問題ない）。
export async function GET(request: Request) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session_id");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? url.origin;

  const redirect = (path: string) =>
    NextResponse.redirect(`${appUrl}${path}`, { status: 303 });

  if (!sessionId) {
    return redirect("/billing?error=missing_session");
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    const { data: billingSession, error: fetchError } = await supabase
      .from("billing_sessions")
      .select("*")
      .eq("session_id", sessionId)
      .maybeSingle();

    if (fetchError || !billingSession) {
      return redirect("/billing?error=session_not_found");
    }

    if (billingSession.status === "completed") {
      return redirect("/billing?success=1");
    }

    const session = await getCheckoutSession(sessionId);
    const customerId =
      typeof session.customer === "string"
        ? session.customer
        : session.customer?.id;
    const subscriptionObj =
      typeof session.subscription === "string" ? null : session.subscription;
    const subscriptionId =
      typeof session.subscription === "string"
        ? session.subscription
        : session.subscription?.id;

    if (session.status !== "complete" || !customerId || !subscriptionId) {
      await supabase
        .from("billing_sessions")
        .update({
          status: session.status === "expired" ? "expired" : "cancelled",
        })
        .eq("session_id", sessionId);

      return redirect(
        session.status === "expired"
          ? "/billing?error=incomplete"
          : "/billing?cancelled=1"
      );
    }

    const plan = billingSession.plan as PlanId;
    const planDef = PLANS[plan];

    if (!planDef || planDef.price <= 0) {
      return redirect("/billing?error=invalid_plan");
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_subscription_id")
      .eq("id", billingSession.user_id)
      .maybeSingle();

    if (
      profile?.stripe_subscription_id &&
      profile.stripe_subscription_id !== subscriptionId
    ) {
      try {
        await cancelSubscription(profile.stripe_subscription_id);
      } catch (e) {
        console.error("既存サブスクリプションの解約に失敗:", e);
      }
    }

    const now = new Date().toISOString();
    const subscriptionStatus = subscriptionObj?.status ?? "active";

    await supabase
      .from("profiles")
      .update({
        plan,
        plan_status: subscriptionStatus === "active" ? "active" : subscriptionStatus,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        plan_updated_at: now,
      })
      .eq("id", billingSession.user_id);

    await supabase
      .from("billing_sessions")
      .update({
        status: "completed",
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        processed_at: now,
      })
      .eq("session_id", sessionId);

    await supabase.from("billing_events_log").insert({
      user_id: billingSession.user_id,
      event_type: "subscription.created_via_return_url",
      plan,
      stripe_subscription_id: subscriptionId,
      amount: planDef.price,
      currency: "JPY",
    });

    return redirect("/billing?success=1");
  } catch (err) {
    console.error("billing return handler error:", err);
    return redirect("/billing?error=server_error");
  }
}