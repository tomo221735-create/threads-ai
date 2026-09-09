import OpenAI from "openai";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: Request) {
  try {
    const { theme, target } = await request.json();

    if (!theme || !target) {
      return NextResponse.json(
        { error: "必要な情報が不足しています。" },
        { status: 400 }
      );
    }

    // ログインユーザーを確認
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error("認証エラー:", userError);

      return NextResponse.json(
        { error: "ログイン情報を確認できません。" },
        { status: 401 }
      );
    }

    // ログイン中のユーザーのプロフィールを取得
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (profileError) {
      console.error("プロフィール取得エラー:", profileError);

      return NextResponse.json(
        { error: "プロフィールの取得に失敗しました。" },
        { status: 500 }
      );
    }

    // プロフィールをAIに渡す
    const prompt = `
あなたはThreads運用のプロフェッショナルです。

以下の「ユーザー本人のプロフィール」を理解したうえで、
その人だからこそ書けるThreads投稿を10個作成してください。

【ユーザー本人の情報】

名前：
${profile.name || "未設定"}

年齢：
${profile.age || "未設定"}

職業：
${profile.job || "未設定"}

肩書き：
${profile.title || "未設定"}

活動地域：
${profile.location || "未設定"}

仕事内容：
${profile.bio || "未設定"}

これまでの経験：
${profile.experience || "未設定"}

得意なこと：
${profile.skills || "未設定"}

これから達成したいこと：
${profile.goals || "未設定"}

発信したいテーマ：
${profile.topics || "未設定"}

商品・サービス：
${profile.products || "未設定"}

投稿したくないテーマ：
${profile.forbidden_topics || "未設定"}

文章の雰囲気：
${profile.tone || "親しみやすい"}

${
  profile.custom_instructions
    ? `\n【ユーザーからの自由な要望（最優先で必ず守ること）】\n${profile.custom_instructions}\n`
    : ""
}

【過去の投稿分析（反応が良かった傾向。可能な範囲で活かすこと）】
${profile.analysis_summary || "まだ分析されていません。"}


【今回の発信テーマ】
${theme}

【ターゲット】
${target}

【目的】
ターゲットに有益な情報を提供しながら、
プロフィールへのアクセスやDMにつながる投稿を作る。


【重要】
- ユーザーからの自由な要望がある場合は、他のどのルールよりも最優先で反映する
- ユーザー本人の経験・仕事・考え方を積極的に活用する
- 誰にでも当てはまる一般論だけの投稿にしない
- 「この人だから言える」と感じる内容にする
- 活動地域が関連する場合は地域性も活用する
- ユーザーが実際に経験していないことを勝手に事実として作らない
- 投稿したくないテーマには触れない
- 誇張した実績を作らない
- 宣伝だけの投稿にしない
- 読者に役立つ具体的な情報を入れる


【投稿ルール】
- 日本語
- Threadsらしい自然な文章
- 1投稿につき200〜400文字程度
- 最初の1〜2行で興味を引く
- ありきたりなAI文章にしない
- 具体的な経験や視点を入れる
- 10個すべて違う切り口にする
- ハッシュタグは基本的に使わない
- 絵文字は必要な場合だけ少量使用

番号を付けて10個出力してください。
`;

    const response = await openai.responses.create({
      model: "gpt-5-mini",
      input: prompt,
    });

    return NextResponse.json({
      result: response.output_text,
    });
  } catch (error) {
    console.error("AI生成エラー:", error);

    return NextResponse.json(
      { error: "AI生成中にエラーが発生しました。" },
      { status: 500 }
    );
  }
}