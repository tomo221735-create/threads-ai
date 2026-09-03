import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

export async function GET(request: Request) {
  try {
    // =========================
    // Cron認証
    // =========================

    const authHeader = request.headers.get("authorization");

    if (
      !process.env.CRON_SECRET ||
      authHeader !== `Bearer ${process.env.CRON_SECRET}`
    ) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // =========================
    // Supabase
    // =========================

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // =========================
    // OpenAI
    // =========================

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY!,
    });

    // =========================
    // 現在時刻（日本時間）
    // =========================

    const now = new Date();

    const japanDate = new Intl.DateTimeFormat("ja-JP", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);

    const japanTime = new Intl.DateTimeFormat("ja-JP", {
      timeZone: "Asia/Tokyo",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(now);

    const postDate = japanDate.replace(/\//g, "-");
    const currentTime = `${japanTime}:00`;

    console.log("Japan date:", postDate);
    console.log("Japan time:", currentTime);

    // =========================
    // 自動投稿ONのユーザー取得
    // =========================

    const { data: settings, error: settingsError } =
      await supabase
        .from("auto_post_settings")
        .select("*")
        .eq("enabled", true);

    if (settingsError) {
      console.error("Settings error:", settingsError);

      return NextResponse.json(
        {
          error: "自動投稿設定の取得に失敗しました。",
        },
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

    // =========================
    // ユーザーごとに処理
    // =========================

    for (const setting of settings) {
      const userId = setting.user_id;

      try {
        // =========================
        // 投稿時間チェック
        // =========================

        const scheduledTimes = [
          setting.post_time_1,
          setting.post_time_2,
          setting.post_time_3,
        ].filter(Boolean);

        const matchedTime = scheduledTimes.find(
          (time: string) => time === currentTime
        );

        // 今の時間に投稿予定がなければスキップ
        if (!matchedTime) {
          continue;
        }

        console.log(
          `投稿時間一致: ${userId} / ${matchedTime}`
        );

        // =========================
        // 二重投稿防止
        // =========================

        const { data: log, error: logError } =
          await supabase
            .from("auto_post_logs")
            .insert({
              user_id: userId,
              post_date: postDate,
              scheduled_time: matchedTime,
              status: "processing",
            })
            .select()
            .single();

        if (logError) {
          // UNIQUE制約に引っかかった場合
          // すでに処理済みなのでスキップ
          if (
            logError.code === "23505"
          ) {
            console.log(
              `Already posted: ${userId} / ${matchedTime}`
            );

            continue;
          }

          throw logError;
        }

        // =========================
        // プロフィール取得
        // =========================

        const { data: profile, error: profileError } =
          await supabase
            .from("profiles")
            .select("*")
            .eq("id", userId)
            .single();

        if (profileError || !profile) {
          throw new Error(
            "プロフィールがありません。"
          );
        }

        // =========================
        // Threads連携確認
        // =========================

        if (
          !profile.threads_access_token ||
          !profile.threads_user_id
        ) {
          throw new Error(
            "Threadsが連携されていません。"
          );
        }

        // =========================
        // AIで投稿生成
        // =========================

        const completion =
          await openai.chat.completions.create({
            model: "gpt-4o-mini",

            messages: [
              {
                role: "system",

                content: `
あなたはThreads専門のSNSマーケティングAIです。

ユーザーのプロフィール、目的、発信テーマをもとに、
今日Threadsに投稿する文章を1つ作成してください。

条件:
- 必ず500文字以内
- 自然な日本語
- Threadsらしい親しみやすい文章
- 宣伝臭を強くしすぎない
- 読んだ人が「ちょっと気になる」と思う内容
- ユーザー本人が書いたようにする
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

【トレンドを活用する】
${setting.auto_trend ? "はい" : "いいえ"}
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

        // =========================
        // 500文字制限
        // =========================

        if (content.length > 500) {
          content = content.slice(0, 497) + "...";
        }

        console.log(
          "Generated post:",
          content
        );

        // =========================
        // Threadsコンテナ作成
        // =========================

        const containerResponse =
          await fetch(
            `https://graph.threads.net/v1.0/${profile.threads_user_id}/threads`,
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

        // =========================
        // Threads公開
        // =========================

        const publishResponse =
          await fetch(
            `https://graph.threads.net/v1.0/${profile.threads_user_id}/threads_publish`,
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

        // =========================
        // 成功ログ
        // =========================

        await supabase
          .from("auto_post_logs")
          .update({
            status: "success",
            post_id: publishData.id,
            content,
          })
          .eq("id", log.id);

        results.push({
          userId,
          success: true,
          postId: publishData.id,
          scheduledTime: matchedTime,
          content,
        });

      } catch (error) {
        console.error(
          "User auto post error:",
          error
        );

        // 失敗した場合はログを削除
        // → 次のCronで再試行できる
        await supabase
          .from("auto_post_logs")
          .delete()
          .eq("user_id", userId)
          .eq("post_date", postDate)
          .eq(
            "scheduled_time",
            setting.post_time_1 === currentTime
              ? setting.post_time_1
              : setting.post_time_2 === currentTime
              ? setting.post_time_2
              : setting.post_time_3
          );

        results.push({
          userId,
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "不明なエラー",
        });
      }
    }

    // =========================
    // 完了
    // =========================

    return NextResponse.json({
      success: true,
      japanTime: currentTime,
      postDate,
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