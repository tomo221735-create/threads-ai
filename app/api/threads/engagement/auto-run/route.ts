import { NextResponse, after } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { requirePlan } from "@/lib/plan-guard";
import { runEngagementForUser } from "@/lib/threads-engagement";// Vercelのプラン上限を超えると怒られるので、その場合は 60 などに下げる
export const maxDuration = 300;

const TOTAL_BUDGET_MS = 270_000; // maxDurationより少し短く
const REPLY_DELAY_MS = 30_000; // 返信と返信の間隔
const DEFAULT_PER_RUN = 3;
const DEFAULT_PER_DAY = 10;

async function markRun(
  supabase: SupabaseClient,
  userId: string,
  error: string | null
) {
  await supabase
    .from("engagement_settings")
    .update({
      last_auto_run_at: new Date().toISOString(),
      last_auto_run_error: error,
    })
    .eq("user_id", userId);
}

async function processAll() {
  const deadline = Date.now() + TOTAL_BUDGET_MS;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

  const { data: list, error } = await supabase
    .from("engagement_settings")
    .select("*")
    .eq("enabled", true);

  if (error) {
    console.error("auto-run settings error:", error);
    return;
  }

  for (const s of list ?? []) {
    if (Date.now() > deadline) {
      console.warn("auto-run: time budget exceeded, remaining users skipped");
      break;
    }

    const userId = s.user_id as string;

    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      if (!profile?.threads_access_token || !profile?.threads_user_id) {
        await markRun(supabase, userId, "Threadsが連携されていません。");
        continue;
      }

      if (
        profile.threads_token_expires_at &&
        new Date(profile.threads_token_expires_at) < new Date()
      ) {
        await markRun(supabase, userId, "Threadsトークンの有効期限が切れています。");
        continue;
      }

      const { data: authUser } = await supabase.auth.admin.getUserById(userId);
      const planCheck = await requirePlan(
        supabase,
        userId,
        ["starter", "pro"],
        authUser?.user?.email
      );

      if (!planCheck.ok) {
        await markRun(supabase, userId, "現在のプランでは利用できません。");
        continue;
      }

      // 直近24時間の自動投稿数から、残り枠を計算
      const perDay: number = s.max_replies_per_day ?? DEFAULT_PER_DAY;
      const perRun: number = s.max_replies_per_run ?? DEFAULT_PER_RUN;
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const { count } = await supabase
        .from("engagement_candidates")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("status", "posted")
        .gte("created_at", since);

      const remaining = Math.max(perDay - (count ?? 0), 0);

      if (s.auto_post && remaining === 0) {
        await markRun(supabase, userId, "1日の上限に達したためスキップしました。");
        continue;
      }

      const result = await runEngagementForUser({
        supabase,
        openai,
        userId,
        profile,
        settings: s,
        autoPost: Boolean(s.auto_post),
        maxReplies: Math.min(perRun, remaining),
        maxKeywords: 8,
        maxPostAgeHours: 24,
        skipAuthorDays: 7,
        replyDelayMs: REPLY_DELAY_MS,
        deadline,
      });

      await markRun(
        supabase,
        userId,
        result.ok ? result.lastError ?? null : result.error
      );
    } catch (e) {
      console.error("auto-run user error:", userId, e);
      await markRun(supabase, userId, "実行中に予期しないエラーが発生しました。");
    }
  }
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");

  if (
    !process.env.CRON_SECRET ||
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // cron-job.org側のタイムアウトを避けるため、先に200を返して裏で処理を続ける
  after(async () => {
    try {
      await processAll();
    } catch (e) {
      console.error("auto-run fatal error:", e);
    }
  });

  return NextResponse.json({ success: true, message: "started" });
}