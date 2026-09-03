import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

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

    // ① 認証コード → 短期アクセストークン
    const tokenResponse = await fetch(
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

    const tokenData = await tokenResponse.json();

    console.log("Threads token response:", tokenData);

    if (!tokenResponse.ok || !tokenData.access_token) {
      return NextResponse.json(
        {
          error: "Threadsアクセストークンの取得に失敗しました。",
          details: tokenData,
        },
        { status: 400 }
      );
    }

    const shortLivedToken = tokenData.access_token;

    // ② 長期アクセストークンへ交換
    const longTokenUrl = new URL(
      "https://graph.threads.net/access_token"
    );

    longTokenUrl.searchParams.set("grant_type", "th_exchange_token");
    longTokenUrl.searchParams.set("client_secret", appSecret);
    longTokenUrl.searchParams.set("access_token", shortLivedToken);

    const longTokenResponse = await fetch(longTokenUrl.toString());

    const longTokenData = await longTokenResponse.json();

    console.log(
      "Threads long token response:",
      {
        ...longTokenData,
        access_token: longTokenData.access_token
          ? "***"
          : undefined,
      }
    );

    if (
      !longTokenResponse.ok ||
      !longTokenData.access_token
    ) {
      return NextResponse.json(
        {
          error: "長期アクセストークンの取得に失敗しました。",
          details: longTokenData,
        },
        { status: 400 }
      );
    }

    const accessToken = longTokenData.access_token;

    // ③ Threadsユーザー情報を取得
    const profileResponse = await fetch(
      `https://graph.threads.net/v1.0/me?fields=id,username&access_token=${encodeURIComponent(
        accessToken
      )}`
    );

    const threadsProfile = await profileResponse.json();

    console.log("Threads profile:", threadsProfile);

    if (!profileResponse.ok || !threadsProfile.id) {
      return NextResponse.json(
        {
          error: "Threadsプロフィールの取得に失敗しました。",
          details: threadsProfile,
        },
        { status: 400 }
      );
    }

    // ④ 現在ログインしているサービスユーザーを取得
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        {
          error:
            "サービスへのログイン情報を確認できません。",
        },
        { status: 401 }
      );
    }

    // ⑤ プロフィールにThreads情報を保存
    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        threads_user_id: threadsProfile.id,
        threads_username: threadsProfile.username,
        threads_access_token: accessToken,
        threads_token_expires_at: new Date(
          Date.now() +
            (longTokenData.expires_in || 5184000) * 1000
        ).toISOString(),
      })
      .eq("id", user.id);

    if (updateError) {
      console.error(
        "Threads情報保存エラー:",
        updateError
      );

      return NextResponse.json(
        {
          error:
            "Threads連携情報の保存に失敗しました。",
        },
        { status: 500 }
      );
    }

    // ⑥ 完了
    return NextResponse.redirect(
      new URL("/?threads=connected", request.url)
    );
  } catch (error) {
    console.error("Threads callback error:", error);

    return NextResponse.json(
      {
        error:
          "Threads連携中にエラーが発生しました。",
      },
      { status: 500 }
    );
  }
}