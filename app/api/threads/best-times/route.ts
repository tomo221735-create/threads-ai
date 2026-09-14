import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getAnalyticsAccess } from "@/lib/plan-guard";

type ThreadsPostRow = {
  posted_at: string | null;
  likes: number | null;
  replies: number | null;
  reposts: number | null;
  quotes: number | null;
  views: number | null;
  engagement_score: number | null;
};

type HourBucket = {
  hour: number;
  label: string;
  postCount: number;
  avgEngagement: number;
  avgLikes: number;
  avgReplies: number;
  avgViews: number;
};

// この件数未満のサンプルしかない時間帯は「参考程度」として扱う目安
const MIN_SAMPLE_FOR_CONFIDENCE = 2;

export async function GET() {
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

    // ② Service Roleで投稿データ取得（analyzeで蓄積されたキャッシュを利用）
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // ②' プランチェック（PRO=フル表示 / STARTER=モザイク表示用にデータは返す / FREE=非表示）
    const { plan, access } = await getAnalyticsAccess(supabase, user.id, user.email);

    if (access === "locked") {
      return NextResponse.json({
        success: true,
        hasEnoughData: false,
        access,
        plan,
        message: "おすすめの投稿時間帯はPROプラン限定機能です。",
        buckets: [],
        recommended: [],
      });
    }

    const { data: rows, error: fetchError } = await supabase
      .from("threads_posts")
      .select("posted_at, likes, replies, reposts, quotes, views, engagement_score")
      .eq("user_id", user.id)
      .not("posted_at", "is", null);

    if (fetchError) {
      console.error("best-times fetch error:", fetchError);

      return NextResponse.json(
        { error: "投稿データの取得に失敗しました。" },
        { status: 500 }
      );
    }

    const posts = (rows ?? []) as ThreadsPostRow[];

    if (posts.length === 0) {
      return NextResponse.json({
        success: true,
        hasEnoughData: false,
        access,
        plan,
        message:
          "まだ分析できる投稿データがありません。「投稿を分析」を実行してから確認してください。",
        buckets: [],
        recommended: [],
      });
    }

    // ③ 投稿時刻（JST）を時間帯（0〜23時）ごとに集計
    const buckets = new Map<
      number,
      { count: number; engagement: number; likes: number; replies: number; views: number }
    >();

    for (const post of posts) {
      if (!post.posted_at) continue;

      const date = new Date(post.posted_at);
      if (Number.isNaN(date.getTime())) continue;

      // JSTの時（0〜23）を取り出す
      // 注意: Intl.DateTimeFormatは"ja-JP"ロケールだと環境によって
      // "14時"のように単位付きの文字列を返すことがあり、そのままNumber()に
      // 通すとNaNになる。"en-US"＋formatToPartsで数値だけを安全に取り出す。
      const hourPart = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Tokyo",
        hour: "2-digit",
        hour12: false,
        // hour12:falseだけだと実装によってはAM/PMサイクルの影響が残ることがあるため、
        // hourCycleを明示して0〜23の24時間表記に固定する
        hourCycle: "h23",
      })
        .formatToParts(date)
        .find((part) => part.type === "hour")?.value;

      if (hourPart == null) continue;

      // hourCycle:"h23"を指定していても環境差で"24"が返るケースに備え、24は0に丸める
      const hour = Number(hourPart) % 24;

      // Number()の変換失敗（NaN）に加え、0〜23の範囲外になる値は
      // 「おすすめの投稿時間帯」に "NaN:00" のような不正な表示が出ないよう除外する
      if (!Number.isInteger(hour) || hour < 0 || hour > 23) continue;

      const bucket = buckets.get(hour) ?? {
        count: 0,
        engagement: 0,
        likes: 0,
        replies: 0,
        views: 0,
      };

      bucket.count += 1;
      bucket.engagement += post.engagement_score ?? 0;
      bucket.likes += post.likes ?? 0;
      bucket.replies += post.replies ?? 0;
      bucket.views += post.views ?? 0;

      buckets.set(hour, bucket);
    }

    if (buckets.size === 0) {
      return NextResponse.json({
        success: true,
        hasEnoughData: false,
        access,
        plan,
        message:
          "投稿の時刻データが取得できませんでした。もう一度「投稿を分析」を実行してください。",
        buckets: [],
        recommended: [],
      });
    }

    const hourBuckets: HourBucket[] = [...buckets.entries()]
      .map(([hour, b]) => ({
        hour,
        label: `${String(hour).padStart(2, "0")}:00`,
        postCount: b.count,
        avgEngagement: Math.round((b.engagement / b.count) * 10) / 10,
        avgLikes: Math.round((b.likes / b.count) * 10) / 10,
        avgReplies: Math.round((b.replies / b.count) * 10) / 10,
        avgViews: Math.round((b.views / b.count) * 10) / 10,
      }))
      .sort((a, b) => a.hour - b.hour);

    // ④ 反応が良い時間帯トップ3を提案（サンプル数も一緒に返し、少ない場合は画面側で注記できるようにする）
    const recommended = [...hourBuckets]
      .sort((a, b) => b.avgEngagement - a.avgEngagement)
      .slice(0, 3);

    const totalPosts = posts.length;
    const lowConfidence = totalPosts < 10;

    return NextResponse.json({
      success: true,
      hasEnoughData: true,
      access,
      plan,
      lowConfidence,
      totalPosts,
      minSampleForConfidence: MIN_SAMPLE_FOR_CONFIDENCE,
      buckets: hourBuckets,
      recommended,
    });
  } catch (error) {
    console.error("best-times error:", error);

    return NextResponse.json(
      { error: "投稿時間の分析中にエラーが発生しました。" },
      { status: 500 }
    );
  }
}