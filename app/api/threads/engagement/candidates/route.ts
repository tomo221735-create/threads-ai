import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase-server";

async function getAuthedUser() {
  const supabaseAuth = await createSupabaseServerClient();

  const {
    data: { user },
    error,
  } = await supabaseAuth.auth.getUser();

  return { user, error };
}

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// 候補一覧を取得。?status=pending のようにフィルタ可能。
export async function GET(request: Request) {
  try {
    const { user, error: userError } = await getAuthedUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: "ログインしてください。" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    const supabase = serviceClient();

    let query = supabase
      .from("engagement_candidates")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) {
      console.error("engagement_candidates fetch error:", error);

      return NextResponse.json(
        { error: "候補一覧の取得に失敗しました。" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, candidates: data ?? [] });
  } catch (error) {
    console.error("engagement candidates GET error:", error);

    return NextResponse.json(
      { error: "候補一覧の取得中にエラーが発生しました。" },
      { status: 500 }
    );
  }
}

// コメント下書きを編集する
export async function PATCH(request: Request) {
  try {
    const { user, error: userError } = await getAuthedUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: "ログインしてください。" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const id = body.id;
    const commentDraft = body.comment_draft;

    if (!id || typeof commentDraft !== "string" || !commentDraft.trim()) {
      return NextResponse.json(
        { error: "コメント内容を入力してください。" },
        { status: 400 }
      );
    }

    const supabase = serviceClient();

    const { data, error } = await supabase
      .from("engagement_candidates")
      .update({
        comment_draft: commentDraft.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("user_id", user.id)
      .eq("status", "pending") // 投稿済み・却下済みは編集不可
      .select()
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: "候補の更新に失敗しました。" },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, candidate: data });
  } catch (error) {
    console.error("engagement candidates PATCH error:", error);

    return NextResponse.json(
      { error: "候補の更新中にエラーが発生しました。" },
      { status: 500 }
    );
  }
}

// 候補を却下する
export async function DELETE(request: Request) {
  try {
    const { user, error: userError } = await getAuthedUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: "ログインしてください。" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "候補IDが指定されていません。" },
        { status: 400 }
      );
    }

    const supabase = serviceClient();

    const { error } = await supabase
      .from("engagement_candidates")
      .update({ status: "rejected", updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      return NextResponse.json(
        { error: "候補の却下に失敗しました。" },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("engagement candidates DELETE error:", error);

    return NextResponse.json(
      { error: "候補の却下中にエラーが発生しました。" },
      { status: 500 }
    );
  }
}