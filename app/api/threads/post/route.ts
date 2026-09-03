import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase-server";

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

    // ② 投稿内容取得
    const body = await request.json();
    const content = body.content;

    if (!content || typeof content !== "string") {
      return NextResponse.json(
        { error: "投稿内容がありません。" },
        { status: 400 }
      );
    }

    // ③ Service Roleでプロフィール取得
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select(
        "threads_user_id, threads_access_token, threads_token_expires_at"
      )
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: "プロフィール情報が見つかりません。" },
        { status: 404 }
      );
    }

    if (!profile.threads_access_token) {
      return NextResponse.json(
        { error: "Threadsアカウントを連携してください。" },
        { status: 400 }
      );
    }

    // ④ Threads投稿用コンテナ作成
    const containerResponse = await fetch(
      "https://graph.threads.net/v1.0/me/threads",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          media_type: "TEXT",
          text: content,
          access_token: profile.threads_access_token,
        }),
      }
    );

    const containerData = await containerResponse.json();

    console.log("Threads container response:", containerData);

    if (!containerResponse.ok || !containerData.id) {
      return NextResponse.json(
        {
          error: "Threads投稿の準備に失敗しました。",
          details: containerData,
        },
        { status: 400 }
      );
    }

    // ⑤ 投稿を公開
    const publishResponse = await fetch(
      "https://graph.threads.net/v1.0/me/threads_publish",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          creation_id: containerData.id,
          access_token: profile.threads_access_token,
        }),
      }
    );

    const publishData = await publishResponse.json();

    console.log("Threads publish response:", publishData);

    if (!publishResponse.ok || !publishData.id) {
      return NextResponse.json(
        {
          error: "Threadsへの投稿に失敗しました。",
          details: publishData,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Threadsへの投稿に成功しました！",
      threads_post_id: publishData.id,
    });
  } catch (error) {
    console.error("Threads post error:", error);

    return NextResponse.json(
      {
        error: "Threads投稿中にエラーが発生しました。",
      },
      { status: 500 }
    );
  }
}