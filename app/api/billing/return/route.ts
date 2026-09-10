import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSession, createSubscription } from "@/lib/komoju";
import { PLANS, PlanId } from "@/lib/plans";

// KOMOJUのホストページ決済完了後、return_url に
// ?session_id=xxxx が付与されてブラウザがリダイレクトされてくる。
// https://doc.komoju.com/recipes/check-session-status-on-return_url
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

    // 既に処理済み（多重アクセス・リロード対策）
    if (billingSession.status === "completed") {
      return redirect("/billing?success=1");
    }

    const session = await getSession(sessionId);

    if (session.status !== "completed" || !session.customer_id) {
      await supabase
        .from("billing_sessions")
        .update({ status: session.status === "cancelled" ? "cancelled" : "expired" })
        .eq("session_id", sessionId);

      return redirect(
        session.status === "cancelled"
          ? "/billing?cancelled=1"
          : "/billing?error=incomplete"
      );
    }

    const plan = billingSession.plan as PlanId;
    const planDef = PLANS[plan];

    if (!planDef || planDef.price <= 0) {
      return redirect("/billing?error=invalid_plan");
    }

    // 既存の有料サブスクがあれば解約してから新しいプランへ切り替える
    // （KOMOJUのSubscriptionは金額変更ができず、削除→新規作成が必要なため）
    const { data: profile } = await supabase
      .from("profiles")
      .select("komoju_subscription_id")
      .eq("id", billingSession.user_id)
      .maybeSingle();

    if (profile?.komoju_subscription_id) {
      try {
        const { deleteSubscription } = await import("@/lib/komoju");
        await deleteSubscription(profile.komoju_subscription_id);
      } catch (e) {
        console.error("既存サブスクリプションの解約に失敗:", e);
        // 続行する（新規作成は試みる）
      }
    }

    const subscription = await createSubscription({
      customerId: session.customer_id,
      amount: planDef.price,
      currency: "JPY",
      period: "monthly",
      metadata: {
        user_id: billingSession.user_id,
        plan,
      },
    });

    const now = new Date().toISOString();

    await supabase
      .from("profiles")
      .update({
        plan,
        plan_status: "active",
        komoju_customer_id: session.customer_id,
        komoju_subscription_id: subscription.id,
        plan_updated_at: now,
      })
      .eq("id", billingSession.user_id);

    await supabase
      .from("billing_sessions")
      .update({
        status: "completed",
        komoju_customer_id: session.customer_id,
        komoju_subscription_id: subscription.id,
        processed_at: now,
      })
      .eq("session_id", sessionId);

    await supabase.from("billing_events_log").insert({
      user_id: billingSession.user_id,
      event_type: "subscription.created_via_return_url",
      plan,
      komoju_subscription_id: subscription.id,
      amount: planDef.price,
      currency: "JPY",
    });

    return redirect("/billing?success=1");
  } catch (err) {
    console.error("billing return handler error:", err);
    return redirect("/billing?error=server_error");
  }
}