import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        {
          error: "ユーザー情報がありません。",
        },
        { status: 400 }
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

const redirectUri = "https://threads-ai-six.vercel.app/api/threads/callback";

       const scopes =
      "threads_basic,threads_content_publish,threads_manage_insights," +
      "threads_keyword_search,threads_manage_replies";

    const state = Buffer.from(
      JSON.stringify({
        userId,
      })
    ).toString("base64url");

    // 2026年にMetaの正式ドキュメントがthreads.netからthreads.comに更新されたため、
    // それに合わせて認可エンドポイントもthreads.comに変更
    const authUrl =
      `https://threads.com/oauth/authorize` +
      `?client_id=${encodeURIComponent(appId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent(scopes)}` +
      `&response_type=code` +
      `&state=${encodeURIComponent(state)}`;

    // 以前はここで302リダイレクトしていたが、モバイル（特にAndroid）だと
    // OSにThreadsアプリへの遷移として横取りされ、連携が完了しないまま
    // Threadsアプリが開くだけになってしまうことがあった。
    // Meta公式ドキュメント推奨の window.open(url, "_system") でこのURLを開いてもらうため、
    // ここではリダイレクトせずJSONでURLを返す。
    return NextResponse.json({ authUrl });
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