import OpenAI from "openai";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// RSSからニュースを取得する関数
async function getNews(query: string, limit = 8) {
  const url =
    `https://news.google.com/rss/search?q=${encodeURIComponent(query)}` +
    `&hl=ja&gl=JP&ceid=JP:ja`;

  const response = await fetch(url, {
    cache: "no-store",
  });

  if (!response.ok) {
    return [];
  }

  const xml = await response.text();

  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
    .slice(0, limit)
    .map((match) => {
      const item = match[1];

      const title =
        item.match(/<title>([\s\S]*?)<\/title>/)?.[1] || "";

      const link =
        item.match(/<link>([\s\S]*?)<\/link>/)?.[1] || "";

      return {
        title: title.replace(/<!\[CDATA\[|\]\]>/g, ""),
        link,
      };
    });
}

export async function POST(request: Request) {
  try {
    const { theme, target } = await request.json();

    if (!theme || !target) {
      return NextResponse.json(
        { error: "テーマとターゲットを入力してください。" },
        { status: 400 }
      );
    }

    // -----------------------------
    // ① ログインユーザー取得
    // -----------------------------

    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error("認証エラー:", userError);

      return NextResponse.json(
        { error: "ログインしてください。" },
        { status: 401 }
      );
    }

    // -----------------------------
    // ② プロフィール取得
    // -----------------------------

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

    const location = profile.location || "日本";
    const job = profile.job || "";
    const topics = profile.topics || "";
    const skills = profile.skills || "";
    const products = profile.products || "";

    // -----------------------------
    // ③ 地域ニュース
    // -----------------------------

    const localNews = await getNews(
      `${location} ニュース`,
      8
    );

    // -----------------------------
    // ④ 全国ニュース
    // -----------------------------

    const nationalNews = await getNews(
      "日本 最新ニュース",
      8
    );

    // -----------------------------
    // ⑤ 業界ニュース
    // -----------------------------

    const industryQuery = [
      job,
      topics,
      skills,
      "ニュース",
    ]
      .filter(Boolean)
      .join(" ");

    const industryNews = await getNews(
      industryQuery || "ビジネス ニュース",
      8
    );

    // -----------------------------
    // ⑥ イベント情報
    // -----------------------------

    const eventNews = await getNews(
      `${location} イベント`,
      8
    );

    // -----------------------------
    // ⑦ 話題のキーワード
    // -----------------------------

    const trendingNews = await getNews(
      "話題 トレンド 日本",
      8
    );

    // -----------------------------
    // ⑧ AIに全部渡す
    // -----------------------------

    const prompt = `
あなたはThreads運用のプロフェッショナルです。

ユーザーのプロフィールと、
現在取得できる最新情報を分析してください。

そして、

「今日、このユーザーがThreadsで投稿すると
反応が期待できるテーマ」

を10個選んでください。

重要なのは、
単にニュースを紹介することではありません。

ニュース・イベント・トレンドと
ユーザー本人の経験・専門性・地域性を掛け合わせ、

「この人だから投稿する意味がある」

というネタを作ることです。

====================
【ユーザープロフィール】
====================

名前：
${profile.name || "未設定"}

年齢：
${profile.age || "未設定"}

職業：
${job || "未設定"}

肩書き：
${profile.title || "未設定"}

活動地域：
${location}

仕事内容：
${profile.bio || "未設定"}

経験：
${profile.experience || "未設定"}

得意分野：
${skills || "未設定"}

発信テーマ：
${topics || "未設定"}

商品・サービス：
${products || "未設定"}

今回の発信テーマ：
${theme}

ターゲット：
${target}


====================
【地域ニュース】
====================

${localNews
  .map((item, i) => `${i + 1}. ${item.title}`)
  .join("\n")}


====================
【全国ニュース】
====================

${nationalNews
  .map((item, i) => `${i + 1}. ${item.title}`)
  .join("\n")}


====================
【業界ニュース】
====================

${industryNews
  .map((item, i) => `${i + 1}. ${item.title}`)
  .join("\n")}


====================
【地域イベント】
====================

${eventNews
  .map((item, i) => `${i + 1}. ${item.title}`)
  .join("\n")}


====================
【話題・トレンド】
====================

${trendingNews
  .map((item, i) => `${i + 1}. ${item.title}`)
  .join("\n")}


====================
【選定ルール】
====================

以下を特に重視してください。

1. ユーザー本人との関連性

2. ユーザーの経験・専門性

3. 活動地域との関連性

4. 今話題になっているか

5. 読者が知りたいと思う内容か

6. Threadsで会話が生まれそうか

7. 投稿するタイミングに意味があるか

8. 将来的にプロフィールアクセスやDMにつながる可能性


====================
【禁止事項】
====================

- ニュースをそのまま紹介しない
- 単なるニュースまとめにしない
- ユーザーが経験していないことを事実として書かない
- 存在しないイベントを作らない
- 存在しないニュースを作らない
- 無理やり地域ニュースと結びつけない
- 無理やりトレンドと結びつけない
- 宣伝だけのネタにしない
- 炎上目的のネタにしない


====================
【出力形式】
====================

10個作成してください。

それぞれ、

【ネタ1】

タイトル：
一言でいうと：

関連する情報：
（地域ニュース / 全国ニュース / 業界ニュース / イベント / トレンド のどれか）

投稿の切り口：
実際にThreadsで何を話すのか。

この人が投稿する理由：
プロフィールのどの部分と関係するのか。

おすすめ度：
★★★★★

の形式にしてください。
`;

    // -----------------------------
    // ⑨ AI生成
    // -----------------------------

    const response = await openai.responses.create({
      model: "gpt-5-mini",
      input: prompt,
    });

    return NextResponse.json({
      result: response.output_text,

      sources: {
        localNews,
        nationalNews,
        industryNews,
        eventNews,
        trendingNews,
      },
    });
  } catch (error) {
    console.error("アイデア生成エラー:", error);

    return NextResponse.json(
      {
        error: "投稿ネタの生成に失敗しました。",
      },
      {
        status: 500,
      }
    );
  }
}