import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const code = searchParams.get("code");
    const state = searchParams.get("state");

    if (!code || !state) {
      return NextResponse.json(
        { error: "認証情報がありません。" },
        { status: 400 }
      );
    }

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

  const redirectUri = "https://threads-ai-six.vercel.app/api/threads/callback";
  
    if (!appId || !appSecret) {
      return NextResponse.json(
        { error: "Threadsの環境変数が設定されていません。" },
        { status: 500 }
      );
    }

    // ① 認証コード → アクセストークン
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

    if (!tokenResponse.ok || !tokenData.access_token) {
      console.error("Threads token error:", tokenData);

      return NextResponse.json(
        {
          error:
            "Threadsアクセストークンの取得に失敗しました。",
        },
        { status: 400 }
      );
    }

    // 今回は長期トークン交換をしない
    const accessToken = tokenData.access_token;

    console.log("Short-lived Threads token obtained.");

    // ①-2 短期トークン → 長期トークン（60日間有効）へ交換
    let finalAccessToken = accessToken;
    let expiresInSeconds = 3600; // デフォルトは短期トークンの有効期限(1時間)

    try {
      const exchangeUrl =
        `https://graph.threads.net/access_token` +
        `?grant_type=th_exchange_token` +
        `&client_secret=${encodeURIComponent(appSecret)}` +
        `&access_token=${encodeURIComponent(accessToken)}`;

      const exchangeResponse = await fetch(exchangeUrl);
      const exchangeData = await exchangeResponse.json();

      if (exchangeResponse.ok && exchangeData.access_token) {
        finalAccessToken = exchangeData.access_token;
        expiresInSeconds = exchangeData.expires_in ?? 60 * 24 * 60 * 60; // 60日
        console.log("Long-lived Threads token obtained.");
      } else {
        console.error(
          "Threads long-lived token exchange failed. Falling back to short-lived token.",
          exchangeData
        );
      }
    } catch (exchangeError) {
      console.error(
        "Threads long-lived token exchange error. Falling back to short-lived token.",
        exchangeError
      );
    }

    // ② Threadsプロフィール取得（長期トークンで取得）
    const profileResponse = await fetch(
      `https://graph.threads.net/v1.0/me?fields=id,username&access_token=${encodeURIComponent(
        finalAccessToken
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

    console.log(
      "Threads profile:",
      threadsProfile.username
    );

// ③ Supabaseへ保存（UPSERT：存在しなければ作成、存在すれば更新）
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// 長期トークンの有効期限（安全のため実際の有効期限より1日早めに切る）
const safetyMarginSeconds = 24 * 60 * 60;
const expiresAt = new Date(
  Date.now() + (expiresInSeconds - safetyMarginSeconds) * 1000
).toISOString();

const { error: upsertError } = await supabase
  .from("profiles")
  .upsert({
    id: userId,  // ← PRIMARY KEY を含める
    threads_user_id: threadsProfile.id,
    threads_username: threadsProfile.username,
    threads_access_token: finalAccessToken,
    threads_token_expires_at: expiresAt,
  });

if (upsertError) {
  console.error("Supabase upsert error:", upsertError);

  return NextResponse.json(
    {
      error: "Threads情報の保存に失敗しました。",
    },
    { status: 500 }
  );
}

    // ④ 完了
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