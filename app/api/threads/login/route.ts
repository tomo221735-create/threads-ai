import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return NextResponse.json(
        {
          error: "先にサービスへログインしてください。",
        },
        { status: 401 }
      );
    }

    const appId = process.env.THREADS_APP_ID;

    if (!appId) {
      return NextResponse.json(
        {
          error: "THREADS_APP_IDが設定されていません。",
        },
        { status: 500 }
      );
    }

    const redirectUri =
      "https://threads-ai-six.vercel.app/api/threads/callback";

    const scopes =
      "threads_basic,threads_content_publish";

    // 現在のSupabaseユーザーをcallbackへ渡す
    const state = Buffer.from(
      JSON.stringify({
        userId: user.id,
      })
    ).toString("base64url");

    const authUrl =
      `https://threads.net/oauth/authorize` +
      `?client_id=${encodeURIComponent(appId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent(scopes)}` +
      `&response_type=code` +
      `&state=${encodeURIComponent(state)}`;

    return NextResponse.redirect(authUrl);
  } catch (error) {
    console.error("Threads login error:", error);

    return NextResponse.json(
      {
        error: "Threadsログインの開始に失敗しました。",
      },
      { status: 500 }
    );
  }
}