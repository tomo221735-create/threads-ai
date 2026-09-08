import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // =========================
    // Threads連携済みユーザーを取得
    // =========================

    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, threads_access_token, threads_token_expires_at")
      .not("threads_access_token", "is", null);

    if (profilesError) {
      console.error("Profiles fetch error:", profilesError);

      return NextResponse.json(
        { error: "プロフィール一覧の取得に失敗しました。" },
        { status: 500 }
      );
    }

    if (!profiles || profiles.length === 0) {
      return NextResponse.json({
        success: true,
        message: "Threads連携済みのユーザーはいません。",
      });
    }

    // 期限が7日以内に切れるトークンだけを更新対象にする
    const refreshThresholdMs = 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();

    const results = [];

    for (const profile of profiles) {
      const expiresAt = profile.threads_token_expires_at
        ? new Date(profile.threads_token_expires_at).getTime()
        : 0;

      const needsRefresh = expiresAt - now < refreshThresholdMs;

      if (!needsRefresh) {
        continue;
      }

      try {
        const refreshUrl =
          `https://graph.threads.net/refresh_access_token` +
          `?grant_type=th_refresh_token` +
          `&access_token=${encodeURIComponent(profile.threads_access_token)}`;

        const refreshResponse = await fetch(refreshUrl);
        const refreshData = await refreshResponse.json();

        if (!refreshResponse.ok || !refreshData.access_token) {
          console.error(
            "Threads token refresh failed:",
            profile.id,
            refreshData
          );

          results.push({
            userId: profile.id,
            success: false,
            error: refreshData?.error?.message ?? "refresh failed",
          });

          continue;
        }

        const expiresInSeconds =
          refreshData.expires_in ?? 60 * 24 * 60 * 60; // 60日

        // 安全のため実際の有効期限より1日早めに切る
        const safetyMarginSeconds = 24 * 60 * 60;
        const newExpiresAt = new Date(
          now + (expiresInSeconds - safetyMarginSeconds) * 1000
        ).toISOString();

        const { error: updateError } = await supabase
          .from("profiles")
          .update({
            threads_access_token: refreshData.access_token,
            threads_token_expires_at: newExpiresAt,
          })
          .eq("id", profile.id);

        if (updateError) {
          console.error(
            "Supabase update error:",
            profile.id,
            updateError
          );

          results.push({
            userId: profile.id,
            success: false,
            error: "保存に失敗しました。",
          });

          continue;
        }

        results.push({
          userId: profile.id,
          success: true,
          newExpiresAt,
        });
      } catch (error) {
        console.error("Token refresh error:", profile.id, error);

        results.push({
          userId: profile.id,
          success: false,
          error:
            error instanceof Error ? error.message : "不明なエラー",
        });
      }
    }

    return NextResponse.json({
      success: true,
      checked: profiles.length,
      refreshed: results.length,
      results,
    });
  } catch (error) {
    console.error("Refresh token cron error:", error);

    return NextResponse.json(
      { error: "トークン更新処理でエラーが発生しました。" },
      { status: 500 }
    );
  }
}