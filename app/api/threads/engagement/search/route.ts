import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requirePlan } from "@/lib/plan-guard";
import { runEngagementForUser } from "@/lib/threads-engagement";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ボタン一発で「検索 → AI判定 → コメント下書き生成」を実行するAPI。
// 設定で auto_post が有効な場合は、判定OKの候補をその場で投稿まで行う。
//
// body: { keyword?: string } を渡すと、保存済みキーワードの代わりに
// そのキーワード1件だけでお試し検索できる。
export async function POST(request: Request) {
  try {
    // ① ログインユーザー確認
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

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // ② プランチェック
    const planCheck = await requirePlan(
      supabase,
      user.id,
      ["starter", "pro"],
      user.email
    );

    if (!planCheck.ok) {
      return NextResponse.json(
        {
          error:
            "この機能はSTARTER以上のプラン限定です。プランをアップグレードしてください。",
          plan: planCheck.plan,
        },
        { status: 403 }
      );
    }

    // ③ プロフィール取得
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
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

    // ④ エンゲージメント設定取得
    const { data: settings } = await supabase
      .from("engagement_settings")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    const body = await request.json().catch(() => ({}));
    const adhocKeyword =
      typeof body.keyword === "string" ? body.keyword.trim() : "";

    // ⑤ 検索 → AI判定 → 保存 → 投稿 は共通関数に任せる
    const result = await runEngagementForUser({
      supabase,
      openai,
      userId: user.id,
      profile,
      settings,
      autoPost: Boolean(settings?.auto_post),
      adhocKeyword: adhocKeyword || undefined,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      );
    }

    if (result.candidates.length === 0) {
      return NextResponse.json({
        success: true,
        message: result.message,
        candidates: [],
      });
    }

    return NextResponse.json({
      success: true,
      searched: result.searched,
      candidates: result.candidates,
    });
  } catch (error) {
    console.error("engagement search error:", error);

    return NextResponse.json(
      { error: "検索・生成処理中にエラーが発生しました。" },
      { status: 500 }
    );
  }
}