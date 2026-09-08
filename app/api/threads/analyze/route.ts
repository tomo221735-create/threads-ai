bash

cat /home/claude/threads-ai-extracted/threads-ai/app/api/threads/analyze/route.ts

出力

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { createSupabaseServerClient } from "@/lib/supabase-server";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type ThreadsPostRaw = {
  id: string;
  text?: string;
  permalink?: string;
  timestamp?: string;
  media_type?: string;
};

type AnalyzedPost = {
  threads_post_id: string;
  text: string;
  permalink: string | null;
  posted_at: string | null;
  likes: number;
  replies: number;
  reposts: number;
  quotes: number;
  views: number;
  engagement_score: number;
};

// 投稿一覧を取得（最新25件）
async function fetchRecentPosts(
  threadsUserId: string,
  accessToken: string
): Promise<ThreadsPostRaw[]> {
  const url =
    `https://graph.threads.net/v1.0/${threadsUserId}/threads` +
    `?fields=id,text,timestamp,permalink,media_type` +
    `&limit=25` +
    `&access_token=${encodeURIComponent(accessToken)}`;

  const response = await fetch(url, { cache: "no-store" });
  const data = await response.json();

  if (!response.ok) {
    const err = new Error(
      data?.error?.message || "投稿一覧の取得に失敗しました。"
    ) as Error & { code?: number };
    err.code = data?.error?.code;
    throw err;
  }

  return (data?.data ?? []) as ThreadsPostRaw[];
}

// 1投稿分のインサイト（いいね・返信など）を取得
async function fetchInsights(postId: string, accessToken: string) {
  const url =
    `https://graph.threads.net/v1.0/${postId}/insights` +
    `?metric=likes,replies,reposts,quotes,views` +
    `&access_token=${encodeURIComponent(accessToken)}`;

  const response = await fetch(url, { cache: "no-store" });
  const data = await response.json();

  if (!response.ok) {
    // インサイト権限がない/古い投稿など、個別の失敗は無視して0扱いにする
    return { likes: 0, replies: 0, reposts: 0, quotes: 0, views: 0 };
  }

  const metrics: Record<string, number> = {
    likes: 0,
    replies: 0,
    reposts: 0,
    quotes: 0,
    views: 0,
  };

  for (const item of data?.data ?? []) {
    const name = item?.name;
    const value = item?.values?.[0]?.value ?? item?.total_value?.value ?? 0;
    if (name in metrics) {
      metrics[name] = Number(value) || 0;
    }
  }

  return metrics;
}

// 数件ずつまとめてインサイトを取得（レート制限対策）
async function fetchInsightsInBatches(
  posts: ThreadsPostRaw[],
  accessToken: string,
  batchSize = 5
) {
  const results: AnalyzedPost[] = [];

  for (let i = 0; i < posts.length; i += batchSize) {
    const batch = posts.slice(i, i + batchSize);

    const batchResults = await Promise.all(
      batch.map(async (post) => {
        const metrics = await fetchInsights(post.id, accessToken);

        const engagementScore =
          metrics.likes +
          metrics.replies * 2 +
          metrics.reposts * 2 +
          metrics.quotes * 2;

        return {
          threads_post_id: post.id,
          text: post.text ?? "",
          permalink: post.permalink ?? null,
          posted_at: post.timestamp ?? null,
          likes: metrics.likes,
          replies: metrics.replies,
          reposts: metrics.reposts,
          quotes: metrics.quotes,
          views: metrics.views,
          engagement_score: engagementScore,
        } satisfies AnalyzedPost;
      })
    );

    results.push(...batchResults);
  }

  return results;
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

    // ③ 投稿一覧を取得
    let rawPosts: ThreadsPostRaw[];

    try {
      rawPosts = await fetchRecentPosts(
        profile.threads_user_id,
        profile.threads_access_token
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "投稿一覧の取得に失敗しました。";

      return NextResponse.json(
        {
          error: message,
          needsReconnect: true,
        },
        { status: 400 }
      );
    }

    if (rawPosts.length === 0) {
      return NextResponse.json({
        success: true,
        message: "分析できる投稿がまだありません。",
        posts: [],
        summary: null,
      });
    }

    // ④ 各投稿のエンゲージメント取得
    const analyzedPosts = await fetchInsightsInBatches(
      rawPosts,
      profile.threads_access_token
    );

    // ⑤ Supabaseにキャッシュ保存
    const rowsToUpsert = analyzedPosts.map((post) => ({
      user_id: user.id,
      ...post,
    }));

    const { error: upsertError } = await supabase
      .from("threads_posts")
      .upsert(rowsToUpsert, { onConflict: "user_id,threads_post_id" });

    if (upsertError) {
      console.error("threads_posts upsert error:", upsertError);
    }

    // ⑥ 反応が良い順に並び替え
    const ranked = [...analyzedPosts].sort(
      (a, b) => b.engagement_score - a.engagement_score
    );

    const topPosts = ranked.slice(0, 5);
    const lowPosts = ranked.slice(-3).reverse();

    const avg = (key: keyof AnalyzedPost) =>
      Math.round(
        analyzedPosts.reduce((sum, p) => sum + (Number(p[key]) || 0), 0) /
          analyzedPosts.length
      );

    const stats = {
      postCount: analyzedPosts.length,
      avgLikes: avg("likes"),
      avgReplies: avg("replies"),
      avgReposts: avg("reposts"),
      avgViews: avg("views"),
    };

    // ⑦ AIで傾向を要約
    const summaryPrompt = `
あなたはThreads運用のプロフェッショナルです。

以下は、あるユーザーの直近の投稿とその反応データです。
このデータから「反応が良い投稿の傾向」と「今後どう活かすべきか」を分析してください。

【ユーザーの発信テーマ】
${profile.topics || "未設定"}

【文章の雰囲気】
${profile.tone || "親しみやすい"}

【反応が良かった投稿（上位）】
${topPosts
  .map(
    (p, i) =>
      `${i + 1}. 「${p.text.slice(0, 120)}」\n   いいね:${p.likes} 返信:${p.replies} リポスト:${p.reposts} 閲覧:${p.views}`
  )
  .join("\n")}

【反応が伸びなかった投稿】
${lowPosts
  .map(
    (p, i) =>
      `${i + 1}. 「${p.text.slice(0, 120)}」\n   いいね:${p.likes} 返信:${p.replies} リポスト:${p.reposts} 閲覧:${p.views}`
  )
  .join("\n")}

【出力してほしいこと】
- 反応が良かった投稿に共通するテーマ・切り口・文章の特徴
- 反応が伸びなかった投稿に共通する特徴
- 次回以降の投稿でどう活かすべきかの具体的なポイント

【条件】
- 日本語
- 300〜500文字程度
- 箇条書きではなく自然な文章でも良いが、要点は明確に
- 断定しすぎず「傾向がある」という書き方にする
`;

    const summaryResponse = await openai.responses.create({
      model: "gpt-5-mini",
      input: summaryPrompt,
    });

    const summary = summaryResponse.output_text?.trim() || null;

    // ⑧ プロフィールに分析結果を保存（AI生成プロンプトへの反映用）
    const { error: saveError } = await supabase
      .from("profiles")
      .update({
        analysis_summary: summary,
        analysis_stats: stats,
        analysis_updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (saveError) {
      console.error("analysis save error:", saveError);
    }

    return NextResponse.json({
      success: true,
      summary,
      stats,
      topPosts,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Threads analyze error:", error);

    return NextResponse.json(
      { error: "投稿分析中にエラーが発生しました。" },
      { status: 500 }
    );
  }
}
