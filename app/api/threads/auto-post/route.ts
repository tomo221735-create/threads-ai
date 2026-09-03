import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(request: Request) {
  try {
    // Cronからのアクセスだけ許可
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

    // 自動投稿ONのユーザーを取得
    const { data: settings, error } = await supabase
      .from("auto_post_settings")
      .select("*")
      .eq("enabled", true);

    if (error) {
      console.error(error);

      return NextResponse.json(
        { error: "設定の取得に失敗しました。" },
        { status: 500 }
      );
    }

    console.log(
      "自動投稿対象ユーザー:",
      settings?.length ?? 0
    );

    // まずは対象ユーザーを確認するだけ
    // 次のステップでAI生成→Threads投稿を追加する

    return NextResponse.json({
      success: true,
      count: settings?.length ?? 0,
      message: "自動投稿処理が起動しました。",
    });
  } catch (error) {
    console.error("Auto post error:", error);

    return NextResponse.json(
      { error: "自動投稿処理でエラーが発生しました。" },
      { status: 500 }
    );
  }
}