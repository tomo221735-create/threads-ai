import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// =========================================================
// 予約投稿（自分で書いた内容を指定した日時に投稿する機能）
// ※ 全自動投稿（AIが内容と時間を決めて投稿する機能）とは
//    完全に別のテーブル・別のエンドポイントです。
// =========================================================

// 大きな数値IDがJSON数値としてパースされ精度が失われるのを防ぐため、
// レスポンスの生テキストから "id":"..." または "id":123... を
// 文字列のまま安全に取り出す
function extractRawId(rawText: string): string | null {
  const match = rawText.match(/"id"\s*:\s*"?(\d+)"?/);
  return match ? match[1] : null;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// コンテナ（投稿の入れ物）が公開できる状態になるまで待つ
async function waitForContainerReady(
  containerId: string,
  accessToken: string,
  maxAttempts = 10,
  intervalMs = 2000
): Promise<void> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const statusUrl =
      `https://graph.threads.net/v1.0/${containerId}` +
      `?fields=status,error_message` +
      `&access_token=${encodeURIComponent(accessToken)}`;

    const statusResponse = await fetch(statusUrl, { cache: "no-store" });
    const statusData = await statusResponse.json();

    if (statusData.status === "FINISHED") {
      return;
    }

    if (statusData.status === "ERROR") {
      throw new Error(
        statusData.error_message || "投稿の準備中にエラーが発生しました。"
      );
    }

    await sleep(intervalMs);
  }

  console.warn("Container status check timed out, trying publish anyway.");
}

// 何らかの理由で長期間実行されず放置された予約投稿は、
// 今さら投稿すると不自然なので「期限切れ」として扱う
const EXPIRE_AFTER_HOURS = 6;

// 繰り返し設定に応じて次回の投稿日時を計算する
// weekly の場合、repeatDays（0=日〜6=土）で指定した曜日のうち
// 直近の次の1日を返す。repeatDays が空の場合は単純に7日後にする
function calculateNextScheduledAt(
  scheduledAt: Date,
  repeatType: string,
  repeatDays: number[] | null
): Date | null {
  if (repeatType === "daily") {
    const next = new Date(scheduledAt);
    next.setDate(next.getDate() + 1);
    return next;
  }

  if (repeatType === "weekly") {
    if (!repeatDays || repeatDays.length === 0) {
      const next = new Date(scheduledAt);
      next.setDate(next.getDate() + 7);
      return next;
    }

    // 翌日から7日以内で、指定曜日に一致する最初の日を探す
    for (let addDays = 1; addDays <= 7; addDays++) {
      const candidate = new Date(scheduledAt);
      candidate.setDate(candidate.getDate() + addDays);

      if (repeatDays.includes(candidate.getDay())) {
        return candidate;
      }
    }

    return null;
  }

  return null;
}

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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const now = new Date();

    // =========================
    // 実行時刻を過ぎた予約投稿を取得
    // =========================

    const { data: duePosts, error: fetchError } = await supabase
      .from("scheduled_posts")
      .select("*")
      .eq("status", "pending")
      .lte("scheduled_at", now.toISOString())
      .order("scheduled_at", { ascending: true })
      .limit(50);

    if (fetchError) {
      console.error("scheduled_posts fetch error:", fetchError);

      return NextResponse.json(
        { error: "予約投稿の取得に失敗しました。" },
        { status: 500 }
      );
    }

    const results = [];

    // 繰り返し設定がある予約について、次回分を新しく作成する
    const scheduleNextOccurrenceIfNeeded = async (
      current: {
        user_id: string;
        content: string;
        scheduled_at: string;
        repeat_type: string;
        repeat_days: number[] | null;
      }
    ) => {
      const nextAt = calculateNextScheduledAt(
        new Date(current.scheduled_at),
        current.repeat_type,
        current.repeat_days
      );

      if (!nextAt) return;

      await supabase.from("scheduled_posts").insert({
        user_id: current.user_id,
        content: current.content,
        scheduled_at: nextAt.toISOString(),
        repeat_type: current.repeat_type,
        repeat_days: current.repeat_days,
        status: "pending",
      });
    };

    for (const scheduledPost of duePosts ?? []) {
      const postId = scheduledPost.id;

      try {
        // =========================
        // 期限切れチェック
        // =========================

        const scheduledAt = new Date(scheduledPost.scheduled_at);
        const hoursLate =
          (now.getTime() - scheduledAt.getTime()) / (1000 * 60 * 60);

        if (hoursLate > EXPIRE_AFTER_HOURS) {
          await supabase
            .from("scheduled_posts")
            .update({
              status: "expired",
              error_message: `予定時刻から${EXPIRE_AFTER_HOURS}時間以上経過したため投稿をスキップしました。`,
            })
            .eq("id", postId)
            .eq("status", "pending");

          await scheduleNextOccurrenceIfNeeded(scheduledPost);

          results.push({ postId, skipped: "expired" });
          continue;
        }

        // =========================
        // 二重投稿防止（他の実行と競合しないよう先に確保する）
        // =========================

        const { data: claimed, error: claimError } = await supabase
          .from("scheduled_posts")
          .update({ status: "processing" })
          .eq("id", postId)
          .eq("status", "pending")
          .select()
          .maybeSingle();

        if (claimError || !claimed) {
          // 既に他の実行が処理中／処理済み
          continue;
        }

        // =========================
        // プロフィール取得
        // =========================

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("threads_access_token, threads_user_id")
          .eq("id", scheduledPost.user_id)
          .single();

        if (profileError || !profile) {
          throw new Error("プロフィールが見つかりません。");
        }

        if (!profile.threads_access_token || !profile.threads_user_id) {
          throw new Error("Threadsが連携されていません。");
        }

        // =========================
        // Threadsコンテナ作成
        // =========================

        const containerResponse = await fetch(
          "https://graph.threads.net/v1.0/me/threads",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              media_type: "TEXT",
              text: scheduledPost.content,
              access_token: profile.threads_access_token,
            }),
          }
        );

        const containerRawText = await containerResponse.text();
        const containerData = JSON.parse(containerRawText);

        const containerId =
          extractRawId(containerRawText) ??
          (containerData.id != null ? String(containerData.id) : null);

        if (!containerResponse.ok || !containerId) {
          throw new Error(
            containerData?.error?.message ||
              containerData?.message ||
              `Threads投稿コンテナの作成に失敗しました。HTTP ${containerResponse.status}`
          );
        }

        await waitForContainerReady(containerId, profile.threads_access_token);

        // =========================
        // Threads公開
        // =========================

        const publishResponse = await fetch(
          "https://graph.threads.net/v1.0/me/threads_publish",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              creation_id: containerId,
              access_token: profile.threads_access_token,
            }),
          }
        );

        const publishData = await publishResponse.json();

        if (!publishResponse.ok || !publishData.id) {
          throw new Error(
            publishData?.error?.message ||
              publishData?.message ||
              `Threadsへの公開に失敗しました。HTTP ${publishResponse.status}`
          );
        }

        // =========================
        // 成功
        // =========================

        await supabase
          .from("scheduled_posts")
          .update({
            status: "success",
            post_id: publishData.id,
          })
          .eq("id", postId);

        await scheduleNextOccurrenceIfNeeded(claimed);

        results.push({ postId, success: true, threadsPostId: publishData.id });
      } catch (error) {
        console.error("Scheduled post error:", error);

        await supabase
          .from("scheduled_posts")
          .update({
            status: "failed",
            error_message:
              error instanceof Error ? error.message : "不明なエラー",
          })
          .eq("id", postId);

        await scheduleNextOccurrenceIfNeeded(scheduledPost);

        results.push({
          postId,
          success: false,
          error: error instanceof Error ? error.message : "不明なエラー",
        });
      }
    }

    return NextResponse.json({ processed: results.length, results });
  } catch (error) {
    console.error("Scheduled post batch error:", error);

    return NextResponse.json(
      { error: "予約投稿の処理中にエラーが発生しました。" },
      { status: 500 }
    );
  }
}