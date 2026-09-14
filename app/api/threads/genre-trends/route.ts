import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getNews, NewsItem } from "@/lib/news";
import { getAnalyticsAccess } from "@/lib/plan-guard";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// 同じ記事の重複を取り除く（リンクが同じ、なければタイトルが同じものを除外）
function dedupeNews(items: NewsItem[]): NewsItem[] {
  const seen = new Set<string>();
  const result: NewsItem[] = [];

  for (const item of items) {
    const key = item.link || item.title;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }

  return result;
}

// ジャンルキーワードで記事を検索する。
// 「テーマ＋職業＋修飾語」のような複合語はGoogleニュース検索がAND扱いになり
// 0件になりやすいので、段階的に条件を緩めながら再検索して精度（ヒット率）を上げる。
async function collectGenreNews(genreKeyword: string) {
  const [topicNews, howToNews, audienceNews] = await Promise.all([
    getNews(`${genreKeyword} 注目`, 10, 21),
    getNews(`${genreKeyword} SNS 発信 コツ`, 8, 45),
    getNews(`${genreKeyword} 悩み`, 8, 45),
  ]);

  let combined = dedupeNews([...topicNews, ...howToNews, ...audienceNews]);
  let broadNews: NewsItem[] = [];

  // ① 記事数が少ない場合：修飾語を外し、期間も広げたゆるい検索にフォールバック
  if (combined.length < 3) {
    broadNews = await getNews(genreKeyword, 12, 60);
    combined = dedupeNews([...combined, ...broadNews]);
  }

  // ② それでも1件も見つからない場合：
  // 「発信テーマ＋職業」のような複合ワードをAND検索してしまっているのが原因のことが多いため、
  // 単語単位に分解してそれぞれ個別に検索する
  if (combined.length === 0) {
    const tokens = genreKeyword
      .split(/[\s　]+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 1);

    if (tokens.length > 1) {
      const tokenResults = await Promise.all(
        tokens.map((t) => getNews(t, 8, 60))
      );
      combined = dedupeNews(tokenResults.flat());
    }
  }

  return { topicNews, howToNews, audienceNews, broadNews, combined };
}

// 画面表示用：保存済みのジャンルトレンド要約とプラン別アクセスレベルを返す。
// STARTERはモザイク表示のため中身（summary）自体は返す。FREEは中身を返さない。
export async function GET() {
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

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

const { plan, access } = await getAnalyticsAccess(supabase, user.id, user.email);

    if (access === "locked") {
      return NextResponse.json({
        success: true,
        access,
        plan,
        summary: null,
        updatedAt: null,
      });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("genre_trend_summary, genre_trend_updated_at")
      .eq("id", user.id)
      .maybeSingle();

    return NextResponse.json({
      success: true,
      access,
      plan,
      summary: profile?.genre_trend_summary ?? null,
      updatedAt: profile?.genre_trend_updated_at ?? null,
    });
  } catch (error) {
    console.error("genre-trends GET error:", error);

    return NextResponse.json(
      { error: "ジャンルトレンドの取得中にエラーが発生しました。" },
      { status: 500 }
    );
  }
}

export async function POST() {
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

    // ② Service Roleでプロフィール取得
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // ②' プランチェック（この先はOpenAI課金が発生するため、生成自体はPRO限定）
const { plan, access } = await getAnalyticsAccess(supabase, user.id, user.email);

    if (access !== "full") {
      return NextResponse.json(
        {
          error: "同ジャンルの人気投稿リサーチはPROプラン限定機能です。",
          access,
          plan,
        },
        { status: 403 }
      );
    }

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

    const genreKeyword =
      [profile.topics, profile.job].filter(Boolean).join(" ") || "ビジネス";

    // ③ ジャンルに関連する記事をいくつかの角度から収集
    // Threads自体の投稿は公式APIでは検索できないため、
    // 「このジャンルで今注目されている話題」「発信のコツ・切り口」の
    // Web記事をリサーチ材料として使う（代替アプローチ）。
    // 条件を絞りすぎて0件になるのを防ぐため、段階的にゆるい検索へフォールバックする
    const { topicNews, howToNews, audienceNews, broadNews, combined } =
      await collectGenreNews(genreKeyword);

    const allTitles = combined.map((n) => n.title).filter(Boolean);

    if (allTitles.length === 0) {
      return NextResponse.json({
        success: true,
        summary: null,
        message:
          "関連する記事が見つかりませんでした。プロフィールの「発信テーマ」「職業」を具体的にすると精度が上がります。",
      });
    }

    // ④ AIで「投稿の切り口」として使える形に要約
    const prompt = `
あなたはSNSコンテンツ戦略の専門家です。

以下は「${genreKeyword}」というジャンルに関連する、最近のWeb記事タイトル一覧です。
Threads公式APIでは他人の投稿を直接取得できないため、
このWeb記事の傾向から「今このジャンルの発信で読者の反応が良さそうな切り口」を推測してください。

【記事タイトル一覧】
${allTitles.map((t, i) => `${i + 1}. ${t}`).join("\n")}

【出力してほしいこと】
上記から、投稿のネタとして使える「切り口」を5つ挙げてください。
各項目は以下の形式にしてください。

・切り口タイトル（一言）
　なぜ今刺さりそうか（1〜2文）

【条件】
- 日本語
- 個別の記事をそのまま紹介するのではなく、「切り口・角度」として抽象化する
- 特定の企業名・個人名を主語にした断定的な事実は書かない（記事の傾向として扱う）
- 「〜という切り口が考えられます」「〜への関心が高まっています」など、推測であることが分かる書き方にする
`;

    const summaryResponse = await openai.responses.create({
      model: "gpt-5-mini",
      input: prompt,
    });

    const summary = summaryResponse.output_text?.trim() || null;

    // ⑤ プロフィールに保存（generate-ideas のプロンプトに自動で反映される）
    const { error: saveError } = await supabase
      .from("profiles")
      .update({
        genre_trend_summary: summary,
        genre_trend_updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (saveError) {
      console.error("genre-trends save error:", saveError);
    }

    return NextResponse.json({
      success: true,
      access,
      plan,
      summary,
      sources: {
        topicNews,
        howToNews,
        audienceNews,
        broadNews,
      },
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("genre-trends error:", error);

    return NextResponse.json(
      { error: "ジャンルトレンドの分析中にエラーが発生しました。" },
      { status: 500 }
    );
  }
}