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

  const authUrl = new URL("https://threads.net/oauth/authorize");

  authUrl.searchParams.set("client_id", appId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set(
    "scope",
    "threads_basic,threads_content_publish"
  );
  authUrl.searchParams.set("response_type", "code");

  return NextResponse.redirect(authUrl.toString());
}