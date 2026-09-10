import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createCustomerSession } from "@/lib/komoju";
import { isPayablePlan } from "@/lib/plans";

export async function POST(request: Request) {
  try {
    // ① ログインユーザー取得
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

    // ② リクエスト検証
    const body = await request.json().catch(() => ({}));
    const plan = body?.plan;

    if (typeof plan !== "string" || !isPayablePlan(plan)) {
      return NextResponse.json(
        { error: "プランの指定が不正です。" },
        { status: 400 }
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!appUrl) {
      return NextResponse.json(
        { error: "NEXT_PUBLIC_APP_URL が設定されていません。" },
        { status: 500 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // ③ customer-modeセッションを新規発行
    //    （カード情報の入力・保存はKOMOJUのホストされたページで行うため、
    //     カード番号が自社サーバーを通過することはない＝PCI-DSSの対象範囲を最小化できる）
    const returnUrl = `${appUrl}/api/billing/return`;

    const session = await createCustomerSession({
      returnUrl,
      email: user.email ?? undefined,
      metadata: {
        user_id: user.id,
        plan,
      },
    });

    // ④ 突き合わせ用にセッションを記録
    const { error: insertError } = await supabase
      .from("billing_sessions")
      .insert({
        session_id: session.id,
        user_id: user.id,
        plan,
        status: "pending",
      });

    if (insertError) {
      console.error("billing_sessions insert error:", insertError);
      return NextResponse.json(
        { error: "決済セッションの作成に失敗しました。" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      checkoutUrl: session.session_url,
    });
  } catch (err) {
    console.error("checkout error:", err);
    return NextResponse.json(
      { error: "決済処理でエラーが発生しました。時間をおいて再度お試しください。" },
      { status: 500 }
    );
  }
}