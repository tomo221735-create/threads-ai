import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

export async function GET(request: Request) {
  try {
    // Cron認証
    const authHeader = request.headers.get("authorization");

    if (
      authHeader !==
      `Bearer ${process.env.CRON_SECRET}`
    ) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY!,
    });

    // 自動投稿ONのユーザー取得
    const { data: settings, error: settingsError } =
      await supabase
        .from("auto_post_settings")
        .select("*")
        .eq("enabled", true);

    if (settingsError) {
      console.error(
        "Settings error:",
        settingsError
      );

      return NextResponse.json(
        { error: "自動投稿設定の取得に失敗しました。" },
        { status: 500 }
      );
    }

    if (!settings || settings.length === 0) {
      return NextResponse.json({
        success: true,
        message: "自動投稿対象ユーザーはいません。",
      });
    }

    const results = [];

    // ユーザーごとに処理
    for (const setting of settings) {
      try {
        const userId = setting.user_id;

        // プロフィール取得
        const { data: profile, error: profileError } =
          await supabase
            .from("profiles")
            .select("*")
            .eq("id", userId)
            .single();

        if (profileError || !profile) {
          console.error(
            "Profile error:",
            profileError
          );

          results.push({
            userId,
            success: false,
            error: "プロフィールがありません。",
          });

          continue;
        }

        // Threads連携確認
        if (
          !profile.threads_access_token ||
          !profile.threads_user_id
        ) {
          results.push({
            userId,
            success: false,
            error: "Threadsが連携されていません。",
          });

          continue;
        }

        // AIに投稿を作らせる
        const completion =
          await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: `
あなたはThreads専門のSNSマーケティングAIです。

ユーザーのプロフィールと目的をもとに、
今日Threadsに投稿する文章を1つ作成してください。

条件:
- 500文字以内
- 自然な日本語
- 宣伝臭を強くしすぎない
- 読んだ人が「ちょっと気になる」と思う内容
- Threadsらしい親しみやすい文章
- ハッシュタグは基本的に使わない
- 文章だけを返す
`,
              },
              {
                role: "user",
                content: `
【名前】
${profile.name ?? ""}

【職業】
${profile.job ?? ""}

【肩書き】
${profile.title ?? ""}

【活動地域】
${profile.location ?? ""}

【仕事内容】
${profile.bio ?? ""}

【これまでの経験】
${profile.experience ?? ""}

【得意なこと】
${profile.skills ?? ""}

【目標】
${profile.goals ?? ""}

【発信したいテーマ】
${profile.topics ?? ""}

【商品・サービス】
${profile.products ?? ""}

【投稿したくないテーマ】
${profile.forbidden_topics ?? ""}

【文章の雰囲気】
${profile.tone ?? "親しみやすい"}

【SNSで達成したい目的】
${setting.purpose ?? ""}
`,
              },
            ],
          });

        let content =
          completion.choices[0]?.message?.content?.trim();

        if (!content) {
          throw new Error(
            "AIから投稿内容が返ってきませんでした。"
          );
        }

        // 念のため500文字以内にする
        if (content.length > 500) {
          content = content.slice(0, 497) + "...";
        }

        console.log(
          "Generated post:",
          content
        );

        // -------------------------
        // Threads投稿
        // -------------------------

        const containerResponse =
          await fetch(
            "https://graph.threads.net/v1.0/" +
              profile.threads_user_id +
              "/threads",
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/x-www-form-urlencoded",
              },
              body: new URLSearchParams({
                media_type: "TEXT",
                text: content,
                access_token:
                  profile.threads_access_token,
              }),
            }
          );

        const containerData =
          await containerResponse.json();

        console.log(
          "Threads container:",
          containerData
        );

        if (
          !containerResponse.ok ||
          !containerData.id
        ) {
          throw new Error(
            "Threads投稿コンテナの作成に失敗しました。"
          );
        }

        // -------------------------
        // Threadsへ公開
        // -------------------------

        const publishResponse =
          await fetch(
            "https://graph.threads.net/v1.0/" +
              profile.threads_user_id +
              "/threads_publish",
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/x-www-form-urlencoded",
              },
              body: new URLSearchParams({
                creation_id:
                  containerData.id,
                access_token:
                  profile.threads_access_token,
              }),
            }
          );

        const publishData =
          await publishResponse.json();

        console.log(
          "Threads publish:",
          publishData
        );

        if (
          !publishResponse.ok ||
          !publishData.id
        ) {
          throw new Error(
            "Threadsへの公開に失敗しました。"
          );
        }

        results.push({
          userId,
          success: true,
          postId: publishData.id,
          content,
        });
      } catch (error) {
        console.error(
          "User auto post error:",
          error
        );

        results.push({
          userId: setting.user_id,
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "不明なエラー",
        });
      }
    }

    return NextResponse.json({
      success: true,
      results,
    });
  } catch (error) {
    console.error(
      "Auto post error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "自動投稿処理でエラーが発生しました。",
      },
      { status: 500 }
    );
  }
}