import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");

    if (!code) {
      return NextResponse.json(
        { error: "認証コードがありません。" },
        { status: 400 }
      );
    }

    const appId = process.env.THREADS_APP_ID;
    const appSecret = process.env.THREADS_APP_SECRET;

    const redirectUri =
      "https://threads-ai-six.vercel.app/api/threads/callback";

    if (!appId || !appSecret) {
      return NextResponse.json(
        { error: "Threadsの環境変数が設定されていません。" },
        { status: 500 }
      );
    }

    // 認証コードをアクセストークンに交換
    const response = await fetch(
      "https://graph.threads.net/oauth/access_token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: appId,
          client_secret: appSecret,
          grant_type: "authorization_code",
          redirect_uri: redirectUri,
          code,
        }),
      }
    );

    const data = await response.json();

    console.log("Threads token response:", data);

    if (!response.ok) {
      return NextResponse.json(
        {
          error: "アクセストークンの取得に失敗しました。",
          details: data,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      message: "Threads連携に成功しました！",
      data,
    });
  } catch (error) {
    console.error("Threads callback error:", error);

    return NextResponse.json(
      { error: "Threads連携中にエラーが発生しました。" },
      { status: 500 }
    );
  }
}