import { NextResponse } from "next/server";

export async function GET() {
  const appId = process.env.THREADS_APP_ID;

  if (!appId) {
    return NextResponse.json(
      { error: "THREADS_APP_IDが設定されていません。" },
      { status: 500 }
    );
  }

  const redirectUri =
    "https://threads-ai-six.vercel.app/api/threads/callback";

  const scopes = "threads_basic,threads_content_publish";

  const authUrl =
    `https://threads.net/oauth/authorize` +
    `?client_id=${encodeURIComponent(appId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent(scopes)}` +
    `&response_type=code`;

  return NextResponse.redirect(authUrl);
}