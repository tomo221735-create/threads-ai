import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { cancelSubscription } from "@/lib/stripe";

export async function POST() {
  try {
    const supabaseAuth = await createSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabaseAuth.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: "ログインしてください。" },
        { status: 401 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("stripe_subscription_id, plan")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: "プロフィール情報が見つかりません。" },
        { status: 404 }
      );
    }

    if (!profile.stripe_subscription_id) {
      return NextResponse.json(
        { error: "有効なサブスクリプションがありません。" },
        { status: 400 }
      );
    }

    try {
      await cancelSubscription(profile.stripe_subscription_id);
    } catch (e) {
      console.error("subscription cancel error:", e);
      return NextResponse.json(
        { error: "解約処理に失敗しました。時間をおいて再度お試しください。" },
        { status: 500 }
      );
    }

    const now = new Date().toISOString();

    await supabase
      .from("profiles")
      .update({
        plan: "free",
        plan_status: "cancelled",
        stripe_subscription_id: null,
        plan_updated_at: now,
      })
      .eq("id", user.id);

    await supabase.from("billing_events_log").insert({
      user_id: user.id,
      event_type: "subscription.cancelled_by_user",
      plan: "free",
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("cancel route error:", err);
    return NextResponse.json(
      { error: "解約処理でエラーが発生しました。" },
      { status: 500 }
    );
  }
}