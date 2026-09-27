import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requirePlan } from "@/lib/plan-guard";
import {
  searchThreadsPosts,
  judgeAndDraftComment,
  postReplyToThreads,
} from "@/lib/threads-engagement";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ボタン一発で「検索 → AI判定 → コメント下書き生成」を実行するAPI。
// 設定で auto_post が有効な場合は、判定OKの候補をその場で投稿まで行う。
//
// body: { keyword?: string } を渡すと、保存済みキーワードの代わりに
// そのキーワード1件だけでお試し検索できる。
export async function POST(request: Request) {
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

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // ② プランチェック（OpenAI課金＋Threads APIレート消費があるため有料プラン限定）
    const planCheck = await requirePlan(
      supabase,
      user.id,
      ["starter", "pro"],
      user.email
    );

    if (!planCheck.ok) {
      return NextResponse.json(
        {
          error:
            "この機能はSTARTER以上のプラン限定です。プランをアップグレードしてください。",
          plan: planCheck.plan,
        },
        { status: 403 }
      );
    }

    // ③ プロフィール取得（Threadsトークン・発信テーマなど）
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

    if (profile.threads_token_expires_at) {
      const expiresAt = new Date(profile.threads_token_expires_at);
      if (expiresAt < new Date()) {
        return NextResponse.json(
          {
            error:
              "Threadsトークンの有効期限が切れています。再度連携してください。",
          },
          { status: 401 }
        );
      }
    }

    // ④ エンゲージメント設定取得
    const { data: settings } = await supabase
      .from("engagement_settings")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    const body = await request.json().catch(() => ({}));
    const adhocKeyword =
      typeof body.keyword === "string" ? body.keyword.trim() : "";

    const keywords: string[] = adhocKeyword
      ? [adhocKeyword]
      : settings?.keywords ?? [];

    if (keywords.length === 0) {
      return NextResponse.json(
        {
          error:
            "検索キーワードが設定されていません。設定画面でキーワードを登録するか、キーワードを指定してください。",
        },
        { status: 400 }
      );
    }

    const searchType: "TOP" | "RECENT" = settings?.search_type ?? "RECENT";
    const excludeAuthors: string[] = (settings?.exclude_authors ?? []).map(
      (a: string) => a.toLowerCase()
    );
    const maxCandidates = settings?.max_candidates_per_run ?? 10;
    const autoPost = Boolean(settings?.auto_post);

    // ⑤ 既に候補化済みの投稿IDを取得（重複回避）
    const { data: existing } = await supabase
      .from("engagement_candidates")
      .select("threads_post_id")
      .eq("user_id", user.id);

    const existingIds = new Set(
      (existing ?? []).map((r: { threads_post_id: string }) => r.threads_post_id)
    );

    const ownUsername = (profile.threads_username ?? "").toLowerCase();

    // ⑥ キーワードごとに検索し、候補を集める
    const rawCandidates: {
      keyword: string;
      id: string;
      text: string;
      permalink: string | null;
      timestamp: string | null;
      username: string | null;
    }[] = [];

    for (const keyword of keywords) {
      try {
        const results = await searchThreadsPosts(
          profile.threads_access_token,
          keyword,
          searchType,
          Math.min(maxCandidates * 3, 50) // 判定前フィルタで減る分、多めに取得
        );

        for (const post of results) {
          const username = (post.username ?? "").toLowerCase();

          if (!post.text) continue; // 本文なしはコメント判定できないので除外
          if (post.is_reply) continue; // リプライそのものへの連鎖は対象外
          if (existingIds.has(post.id)) continue;
          if (username && username === ownUsername) continue;
          if (username && excludeAuthors.includes(username)) continue;

          rawCandidates.push({
            keyword,
            id: post.id,
            text: post.text,
            permalink: post.permalink,
            timestamp: post.timestamp,
            username: post.username,
          });

          existingIds.add(post.id); // 同じ実行内での重複も防ぐ
        }
      } catch (searchError) {
        console.error(`keyword_search error (${keyword}):`, searchError);
        // 1キーワードの失敗で全体を止めない
      }
    }

    const targets = rawCandidates.slice(0, maxCandidates);

    if (targets.length === 0) {
      return NextResponse.json({
        success: true,
        message:
          "条件に合う新しい投稿が見つかりませんでした。キーワードや除外設定を見直してみてください。",
        candidates: [],
      });
    }

    // ⑦ AIで判定＋コメント生成 → DB保存（必要ならその場で投稿）
    const savedCandidates = [];

    for (const target of targets) {
      let judged;

      try {
        judged = await judgeAndDraftComment(openai, {
          postText: target.text,
          authorUsername: target.username,
          judgeCriteria: settings?.judge_criteria ?? null,
          replyTone: settings?.reply_tone ?? null,
          userTopics: profile.topics ?? null,
          userForbiddenTopics: profile.forbidden_topics ?? null,
        });
      } catch (aiError) {
        console.error("judgeAndDraftComment error:", aiError);
        judged = {
          shouldReply: false,
          reason: "AI判定中にエラーが発生しました。",
          comment: null,
        };
      }

      let status: "pending" | "rejected" | "posted" | "failed" = judged.shouldReply
        ? "pending"
        : "rejected";
      let replyPostId: string | null = null;
      let errorMessage: string | null = null;

      if (judged.shouldReply && autoPost && judged.comment) {
        try {
          replyPostId = await postReplyToThreads(
            profile.threads_user_id,
            profile.threads_access_token,
            target.id,
            judged.comment
          );
          status = "posted";
        } catch (postError) {
          console.error("auto post reply error:", postError);
          status = "failed";
          errorMessage =
            postError instanceof Error ? postError.message : "投稿に失敗しました。";
        }
      }

      const { data: saved, error: insertError } = await supabase
        .from("engagement_candidates")
        .insert({
          user_id: user.id,
          keyword: target.keyword,
          threads_post_id: target.id,
          author_username: target.username,
          post_text: target.text,
          permalink: target.permalink,
          post_created_at: target.timestamp,
          judge_passed: judged.shouldReply,
          judge_reason: judged.reason,
          comment_draft: judged.comment,
          status,
          reply_post_id: replyPostId,
          error_message: errorMessage,
        })
        .select()
        .single();

      if (insertError) {
        // unique制約違反（同時実行などでの重複）は無視して続行
        if (insertError.code !== "23505") {
          console.error("engagement_candidates insert error:", insertError);
        }
        continue;
      }

      savedCandidates.push(saved);
    }

    return NextResponse.json({
      success: true,
      searched: targets.length,
      candidates: savedCandidates,
    });
  } catch (error) {
    console.error("engagement search error:", error);

    return NextResponse.json(
      { error: "検索・生成処理中にエラーが発生しました。" },
      { status: 500 }
    );
  }
}