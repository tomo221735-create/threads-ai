import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getAnalyticsAccess } from "@/lib/plan-guard";

type ThreadsPostRow = {
  posted_at: string | null;
  likes: number | null;
  replies: number | null;
  reposts: number | null;
  views: number | null;
  engagement_score: number | null;
};

type WeekPoint = {
  weekStart: string; // YYYY-MM-DD（その週の月曜日、JST基準）
  label: string; // 画面表示用（M/D）
  postCount: number;
  totalLikes: number;
  totalReplies: number;
  totalViews: number;
  avgEngagement: number;
};

// JST基準で「その日が属する週の月曜日」を YYYY-MM-DD で返す
function getWeekStart(date: Date): string {
  const jstStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date); // "YYYY-MM-DD"

  const jstDate = new Date(`${jstStr}T00:00:00+09:00`);
  const day = jstDate.getUTCDay(); // 0=日, 1=月, ...
  const diffToMonday = day === 0 ? 6 : day - 1;

  jstDate.setUTCDate(jstDate.getUTCDate() - diffToMonday);

  return jstDate.toISOString().slice(0, 10);
}

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

    // ② Service Roleで投稿データ取得
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
        message: "パフォーマンスの推移グラフはPROプラン限定機能です。",
        weekly: [],
        overall: null,
      });
    }

    const { data: rows, error: fetchError } = await supabase
      .from("threads_posts")
      .select("posted_at, likes, replies, reposts, views, engagement_score")
      .eq("user_id", user.id)
      .not("posted_at", "is", null)
      .order("posted_at", { ascending: true });

    if (fetchError) {
      console.error("performance fetch error:", fetchError);

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
        weekly: [],
        overall: null,
      });
    }

    // ③ 週（月曜始まり・JST）ごとに集計
    const weekMap = new Map<
      string,
      { count: number; likes: number; replies: number; views: number; engagement: number }
    >();

    for (const post of posts) {
      if (!post.posted_at) continue;

      const date = new Date(post.posted_at);
      if (Number.isNaN(date.getTime())) continue;

      const weekStart = getWeekStart(date);

      const w = weekMap.get(weekStart) ?? {
        count: 0,
        likes: 0,
        replies: 0,
        views: 0,
        engagement: 0,
      };

      w.count += 1;
      w.likes += post.likes ?? 0;
      w.replies += post.replies ?? 0;
      w.views += post.views ?? 0;
      w.engagement += post.engagement_score ?? 0;

      weekMap.set(weekStart, w);
    }

    const weekly: WeekPoint[] = [...weekMap.entries()]
      .map(([weekStart, w]) => {
        const d = new Date(`${weekStart}T00:00:00+09:00`);

        return {
          weekStart,
          label: `${d.getUTCMonth() + 1}/${d.getUTCDate()}`,
          postCount: w.count,
          totalLikes: w.likes,
          totalReplies: w.replies,
          totalViews: w.views,
          avgEngagement: Math.round((w.engagement / w.count) * 10) / 10,
        };
      })
      .sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1));

    // ④ 全体サマリー（直近と、その前の比較）
    const last = weekly[weekly.length - 1] ?? null;
    const prev = weekly.length >= 2 ? weekly[weekly.length - 2] : null;

    const overall = {
      totalPosts: posts.length,
      weeksTracked: weekly.length,
      latestWeek: last,
      previousWeek: prev,
      // 直近週が前週と比べて伸びているか（データが2週分以上ある場合のみ判定）
      trend:
        last && prev
          ? last.avgEngagement > prev.avgEngagement
            ? "up"
            : last.avgEngagement < prev.avgEngagement
              ? "down"
              : "flat"
          : null,
    };

    return NextResponse.json({
      success: true,
      hasEnoughData: true,
      access,
      plan,
      weekly,
      overall,
    });
  } catch (error) {
    console.error("performance error:", error);

    return NextResponse.json(
      { error: "パフォーマンス集計中にエラーが発生しました。" },
      { status: 500 }
    );
  }
}