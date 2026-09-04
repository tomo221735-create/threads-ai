import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const code = searchParams.get("code");
    const state = searchParams.get("state");

    if (!code) {
      return NextResponse.json(
        { error: "認証コードがありません。" },
        { status: 400 }
      );
    }

    if (!state) {
      return NextResponse.json(
        { error: "stateがありません。" },
        { status: 400 }
      );
    }

    // stateからユーザーIDを復元
    let userId: string;

    try {
      const decoded = JSON.parse(
        Buffer.from(state, "base64url").toString("utf8")
      );

      userId = decoded.userId;

      if (!userId) {
        throw new Error("userIdがありません");
      }
    } catch {
      return NextResponse.json(
        { error: "stateが不正です。" },
        { status: 400 }
      );
    }

    const appId = process.env.THREADS_APP_ID;
    const appSecret = process.env.THREADS_APP_SECRET;

    const redirectUri =
      "https://threads-ai-six.vercel.app/api/threads/callback";

    if (!appId || !appSecret) {
      return NextResponse.json(
        {
          error:
            "Threadsの環境変数が設定されていません。",
        },
        { status: 500 }
      );
    }

    // -----------------------------
    // ① code → 短期アクセストークン
    // -----------------------------

    const tokenResponse = await fetch(
      "https://graph.threads.net/oauth/access_token",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded",
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

    if (
      !tokenResponse.ok ||
      !tokenData.access_token
    ) {
      console.error(
        "Threads token error:",
        tokenData
      );

      return NextResponse.json(
        {
          error:
            "Threadsアクセストークンの取得に失敗しました。",
        },
        { status: 400 }
      );
    }

    const shortLivedToken =
      tokenData.access_token;

    // -----------------------------
    // ② 長期アクセストークン
    // -----------------------------

    console.log("Long token exchange starting");
console.log("Short token exists:", !!shortLivedToken);
console.log("App secret exists:", !!appSecret);

    const longTokenUrl = new URL(
      "https://graph.threads.net/access_token"
    );

    longTokenUrl.searchParams.set(
      "grant_type",
      "th_exchange_token"
    );

    longTokenUrl.searchParams.set(
      "client_secret",
      appSecret
    );

    longTokenUrl.searchParams.set(
      "access_token",
      shortLivedToken
    );

    const longTokenResponse = await fetch(
      longTokenUrl.toString()
    );

    const longTokenData =
      await longTokenResponse.json();

    if (
      !longTokenResponse.ok ||
      !longTokenData.access_token
    ) {
     console.error("Threads long token error:", {
  status: longTokenResponse.status,
  statusText: longTokenResponse.statusText,
  data: longTokenData,
});

      return NextResponse.json(
        {
          error:
            "長期アクセストークンの取得に失敗しました。",
        },
        { status: 400 }
      );
    }

    const accessToken =
      longTokenData.access_token;

    // -----------------------------
    // ③ Threadsプロフィール取得
    // -----------------------------

    const profileResponse = await fetch(
      `https://graph.threads.net/v1.0/me?fields=id,username&access_token=${encodeURIComponent(
        accessToken
      )}`
    );

    const threadsProfile =
      await profileResponse.json();

    if (
      !profileResponse.ok ||
      !threadsProfile.id
    ) {
      console.error(
        "Threads profile error:",
        threadsProfile
      );

      return NextResponse.json(
        {
          error:
            "Threadsプロフィールの取得に失敗しました。",
        },
        { status: 400 }
      );
    }

    // -----------------------------
    // ④ Supabaseへ保存
    // -----------------------------

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const expiresIn =
      longTokenData.expires_in || 5184000;

    const expiresAt = new Date(
      Date.now() + expiresIn * 1000
    ).toISOString();

    const { error: updateError } =
      await supabase
        .from("profiles")
        .update({
          threads_user_id:
            threadsProfile.id,
          threads_username:
            threadsProfile.username,
          threads_access_token:
            accessToken,
          threads_token_expires_at:
            expiresAt,
        })
        .eq("id", userId);

    if (updateError) {
      console.error(
        "Supabase update error:",
        updateError
      );

      return NextResponse.json(
        {
          error:
            "Threads情報の保存に失敗しました。",
        },
        { status: 500 }
      );
    }

    // -----------------------------
    // ⑤ 完了
    // -----------------------------

    return NextResponse.redirect(
      new URL(
        "/?threads=connected",
        request.url
      )
    );
  } catch (error) {
    console.error(
      "Threads callback error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Threads連携中にエラーが発生しました。",
      },
      { status: 500 }
    );
  }
}