import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { postReplyToThreads } from "@/lib/threads-engagement";

// レビュー済みの候補（pending）を、実際にThreadsへリプライとして投稿する。
export async function POST(request: Request) {
  try {
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

    const body = await request.json();
    const candidateId = body.id;

    if (!candidateId) {
      return NextResponse.json(
        { error: "候補IDが指定されていません。" },
        { status: 400 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: candidate, error: candidateError } = await supabase
      .from("engagement_candidates")
      .select("*")
      .eq("id", candidateId)
      .eq("user_id", user.id)
      .single();

    if (candidateError || !candidate) {
      return NextResponse.json(
        { error: "候補が見つかりません。" },
        { status: 404 }
      );
    }

    if (candidate.status === "posted") {
      return NextResponse.json(
        { error: "この候補はすでに投稿済みです。" },
        { status: 400 }
      );
    }

    if (!candidate.comment_draft) {
      return NextResponse.json(
        { error: "コメント内容がありません。" },
        { status: 400 }
      );
    }

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

    if (!profile.threads_access_token || !profile.threads_user_id) {
      return NextResponse.json(
        { error: "Threadsアカウントを連携してください。" },
        { status: 400 }
      );
    }

    if (profile.threads_token_expires_at) {
      const expiresAt = new Date(profile.threads_token_expires_at);
      if (expiresAt < new Date()) {
        return NextResponse.json(
          {
            error:
              "Threadsトークンの有効期限が切れています。再度連携してください。",
          },
          { status: 401 }
        );
      }
    }

    try {
      const replyPostId = await postReplyToThreads(
        profile.threads_user_id,
        profile.threads_access_token,
        candidate.threads_post_id,
        candidate.comment_draft
      );

      const { data: updated, error: updateError } = await supabase
        .from("engagement_candidates")
        .update({
          status: "posted",
          reply_post_id: replyPostId,
          error_message: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", candidateId)
        .select()
        .single();

      if (updateError) {
        console.error("engagement candidate update error:", updateError);
      }

      return NextResponse.json({
        success: true,
        message: "コメントを投稿しました！",
        candidate: updated ?? candidate,
        threads_reply_id: replyPostId,
      });
    } catch (postError) {
      const message =
        postError instanceof Error ? postError.message : "投稿に失敗しました。";

      await supabase
        .from("engagement_candidates")
        .update({
          status: "failed",
          error_message: message,
          updated_at: new Date().toISOString(),
        })
        .eq("id", candidateId);

      return NextResponse.json(
        { error: message },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("engagement reply error:", error);

    return NextResponse.json(
      { error: "コメント投稿中にエラーが発生しました。" },
      { status: 500 }
    );
  }
}