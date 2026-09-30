// 「他ユーザーの投稿を検索 → AIで判定 → AIコメント生成 → 投稿」機能の共通処理。
//
// 手動実行API（/api/threads/engagement/search）と
// 自動実行cron（/api/threads/engagement/auto-run）の両方から使われる。

import OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";

// 大きな数値IDがJSON数値としてパースされ精度が失われるのを防ぐため、
// レスポンスの生テキストから "id":"..." または "id":123... を
// 文字列のまま安全に取り出す（既存の他ルートと同じ方針）
export function extractRawId(rawText: string): string | null {
  const match = rawText.match(/"id"\s*:\s*"?(\d+)"?/);
  return match ? match[1] : null;
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type ThreadsSearchResult = {
  id: string;
  text: string;
  permalink: string | null;
  timestamp: string | null;
  username: string | null;
  is_reply: boolean;
};

// Threads Keyword Search API
// https://developers.facebook.com/documentation/threads/keyword-search
// 注意：アプリが threads_keyword_search 権限の審査に通っていない場合、
// 検索対象は「認証ユーザー自身の投稿」のみに制限される（Meta仕様）。
export async function searchThreadsPosts(
  accessToken: string,
  keyword: string,
  searchType: "TOP" | "RECENT",
  limit: number
): Promise<ThreadsSearchResult[]> {
  const url =
    `https://graph.threads.net/v1.0/keyword_search` +
    `?q=${encodeURIComponent(keyword)}` +
    `&search_type=${searchType}` +
    `&fields=id,text,permalink,timestamp,username,is_reply` +
    `&limit=${Math.min(Math.max(limit, 1), 100)}` +
    `&access_token=${encodeURIComponent(accessToken)}`;

  const response = await fetch(url, { cache: "no-store" });
  const data = await response.json();

  if (!response.ok) {
    const err = new Error(
      data?.error?.message || "Threads投稿の検索に失敗しました。"
    ) as Error & { code?: number };
    err.code = data?.error?.code;
    throw err;
  }

  return (data?.data ?? []) as ThreadsSearchResult[];
}

export type JudgeAndDraftInput = {
  postText: string;
  authorUsername: string | null;
  judgeCriteria: string | null;
  replyTone: string | null;
  userTopics: string | null;
  userForbiddenTopics: string | null;
  targetPersona: string | null;
};

export type JudgeAndDraftResult = {
  shouldReply: boolean;
  reason: string;
  comment: string | null;
};

// 1回のAI呼び出しで「判定」と「コメント生成」をまとめて行う。
// （呼び出し回数とレイテンシを抑えつつ、判定理由とコメントを一貫させるため）
export async function judgeAndDraftComment(
  openai: OpenAI,
  input: JudgeAndDraftInput
): Promise<JudgeAndDraftResult> {
  const systemPrompt = `
あなたはThreadsで他ユーザーの投稿にコメント（リプライ）するかどうかを判断し、
コメントする場合はその文章を作成するAIです。

必ず以下のJSON形式のみで回答してください。前置きや説明文、Markdownのコードブロックは不要です。
{
  "should_reply": true または false,
  "reason": "判定理由を1〜2文で",
  "comment": "コメント本文。should_replyがfalseの場合はnull"
}

判定の基準:
- 明らかな宣伝・スパム・炎上目的・攻撃的な投稿にはコメントしない
- 投稿内容が不明瞭すぎる、または文脈が読めない場合はコメントしない
- ユーザーが「投稿したくないテーマ」に触れている投稿にはコメントしない
- ユーザーの専門性・発信テーマと自然に関連づけられる投稿を優先する
- 質問・悩み・意見表明など、返信することで会話が生まれそうな投稿を優先する

コメント作成時の条件:
- 必ず100文字以内
- 自然な日本語、Threadsらしい口語的な文章
- 相手の投稿内容を踏まえた、具体的で気の利いたコメントにする
- テンプレート的な「いいですね！」のような当たり障りのないコメントは避ける
- 宣伝・営業色を出さない
- 絵文字は使っても0〜1個まで
- 相手を否定・説教するような内容にしない
`;

  const userPrompt = `
【コメント候補の投稿】
投稿者: ${input.authorUsername ?? "不明"}
本文: ${input.postText}

【コメントする文章の雰囲気】
${input.replyTone || "親しみやすい"}

【自分（コメントする側）の発信テーマ・専門性】
${input.userTopics || "未設定"}

【コメントしたくないテーマ・避けたい話題】
${input.userForbiddenTopics || "特になし"}

【探している投稿者像（この特徴に近いほど積極的にコメントする）】
${input.targetPersona || "特に指定なし"}

【ユーザー独自の判定基準（最優先で守ること）】
${input.judgeCriteria || "特になし（上記の基準のみで判断してよい）"}
`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const raw = completion.choices[0]?.message?.content?.trim();

  if (!raw) {
    return { shouldReply: false, reason: "AIから応答がありませんでした。", comment: null };
  }

  try {
    const parsed = JSON.parse(raw);

    let comment: string | null =
      typeof parsed.comment === "string" ? parsed.comment.trim() : null;

    if (comment && comment.length > 100) {
      comment = comment.slice(0, 97) + "...";
    }

    return {
      shouldReply: Boolean(parsed.should_reply) && Boolean(comment),
      reason:
        typeof parsed.reason === "string" ? parsed.reason : "判定理由なし",
      comment: Boolean(parsed.should_reply) ? comment : null,
    };
  } catch (error) {
    console.error("judgeAndDraftComment JSON parse error:", error, raw);

    return {
      shouldReply: false,
      reason: "AIの応答を解析できませんでした。",
      comment: null,
    };
  }
}

// ペルソナ描写（自由記述の「探している投稿者像」）から、
// Threads keyword_search にかけるための具体的な検索キーワードを複数生成する。
// 例:「お客さんが来なくて困っているサロン」→
//     ["サロン 集客", "お客さん来ない", "サロン 経営 悩み", ...]
export async function expandPersonaToKeywords(
  openai: OpenAI,
  persona: string,
  maxKeywords = 5
): Promise<string[]> {
  const systemPrompt = `
あなたはSNS（Threads）で特定の悩み・状況を持つ投稿者を見つけるための
検索キーワードを考えるアシスタントです。

与えられた「探している投稿者像」の説明から、その人物が実際に投稿していそうな
文章に含まれる可能性が高い、短い検索キーワード（2〜4単語程度の日本語フレーズ）を
${maxKeywords}個まで考えてください。

条件:
- 実際にSNSの投稿文に出てきそうな、自然な言い回しにする
- 抽象的すぎる言葉（例:「悩み」だけ）は避け、具体的な状況が伝わる組み合わせにする
- 同じ意味の言い換えを複数含めて、表記ゆれをカバーする
- 必ず以下のJSON形式のみで回答する（説明文やMarkdownは不要）:
{ "keywords": ["キーワード1", "キーワード2", ...] }
`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `探している投稿者像: ${persona}` },
    ],
  });

  const raw = completion.choices[0]?.message?.content?.trim();

  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    const keywords = Array.isArray(parsed.keywords) ? parsed.keywords : [];

    return keywords
      .map((k: unknown) => String(k).trim())
      .filter(Boolean)
      .slice(0, maxKeywords);
  } catch (error) {
    console.error("expandPersonaToKeywords JSON parse error:", error, raw);
    return [];
  }
}

export type JudgeAndSelectTemplateInput = JudgeAndDraftInput & {
  templates: string[];
};

export type JudgeAndSelectTemplateResult = {
  shouldReply: boolean;
  reason: string;
  comment: string | null;
};

// 「判定」と「登録済み定型文の中から一番合うものを1つ選ぶ」処理をまとめて行う。
// 選ばれた定型文の文面は一切変更せず、そのまま comment として返す。
export async function judgeAndSelectTemplate(
  openai: OpenAI,
  input: JudgeAndSelectTemplateInput
): Promise<JudgeAndSelectTemplateResult> {
  if (input.templates.length === 0) {
    return {
      shouldReply: false,
      reason: "定型文が1件も登録されていません。",
      comment: null,
    };
  }

  const templateList = input.templates
    .map((t, i) => `${i}: ${t}`)
    .join("\n");

  const systemPrompt = `
あなたはThreadsで他ユーザーの投稿にコメント（リプライ）するかどうかを判断し、
コメントする場合は、あらかじめ用意された定型文の中から最も合うものを1つ選ぶAIです。

必ず以下のJSON形式のみで回答してください。前置きや説明文は不要です。
{
  "should_reply": true または false,
  "reason": "判定理由を1〜2文で",
  "template_index": should_replyがtrueの場合のみ、選んだ定型文の番号（数値）。falseの場合はnull
}

判定の基準:
- 明らかな宣伝・スパム・炎上目的・攻撃的な投稿にはコメントしない
- ユーザーが「投稿したくないテーマ」に触れている投稿にはコメントしない
- 「探している投稿者像」に近い投稿を優先する
- どの定型文を使っても不自然にならない投稿にだけコメントする
  （定型文の内容と噛み合わない投稿には無理にコメントしない）
`;

  const userPrompt = `
【コメント候補の投稿】
投稿者: ${input.authorUsername ?? "不明"}
本文: ${input.postText}

【探している投稿者像】
${input.targetPersona || "特に指定なし"}

【自分（コメントする側）の発信テーマ・専門性】
${input.userTopics || "未設定"}

【コメントしたくないテーマ・避けたい話題】
${input.userForbiddenTopics || "特になし"}

【ユーザー独自の判定基準（最優先で守ること）】
${input.judgeCriteria || "特になし（上記の基準のみで判断してよい）"}

【登録済みの定型文一覧（番号: 本文）】
${templateList}
`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const raw = completion.choices[0]?.message?.content?.trim();

  if (!raw) {
    return { shouldReply: false, reason: "AIから応答がありませんでした。", comment: null };
  }

  try {
    const parsed = JSON.parse(raw);
    const index = Number(parsed.template_index);

    const shouldReply =
      Boolean(parsed.should_reply) &&
      Number.isInteger(index) &&
      index >= 0 &&
      index < input.templates.length;

    return {
      shouldReply,
      reason:
        typeof parsed.reason === "string" ? parsed.reason : "判定理由なし",
      comment: shouldReply ? input.templates[index] : null, // 定型文をそのまま使用（文面は一切変更しない）
    };
  } catch (error) {
    console.error("judgeAndSelectTemplate JSON parse error:", error, raw);

    return {
      shouldReply: false,
      reason: "AIの応答を解析できませんでした。",
      comment: null,
    };
  }
}

// コンテナ（投稿の入れ物）が公開できる状態になるまで待つ
export async function waitForContainerReady(
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

// 他ユーザーの投稿（またはリプライ）に対してコメントを投稿する。
// Threads APIの仕様上、リプライ可能なのは
// 「自分がルート投稿の所有者」または「threads_keyword_search /
//  threads_manage_mentions 権限を持つ」場合のみ。
// https://developers.facebook.com/documentation/threads/retrieve-and-manage-replies/create-replies
export async function postReplyToThreads(
  threadsUserId: string,
  accessToken: string,
  replyToId: string,
  text: string
): Promise<string> {
  const containerResponse = await fetch(
    "https://graph.threads.net/v1.0/me/threads",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        media_type: "TEXT",
        text,
        reply_to_id: replyToId,
        access_token: accessToken,
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
        `返信コンテナの作成に失敗しました。HTTP ${containerResponse.status}`
    );
  }

  await waitForContainerReady(containerId, accessToken);

  const publishResponse = await fetch(
    `https://graph.threads.net/v1.0/${threadsUserId}/threads_publish`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        creation_id: containerId,
        access_token: accessToken,
      }),
    }
  );

  const publishData = await publishResponse.json();

  if (!publishResponse.ok || !publishData.id) {
    throw new Error(
      publishData?.error?.message ||
        publishData?.message ||
        `返信の投稿に失敗しました。HTTP ${publishResponse.status}`
    );
  }

  return String(publishData.id);
}// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

export type RunEngagementParams = {
  supabase: SupabaseClient;
  openai: OpenAI;
  userId: string;
  profile: Row;
  settings: Row | null;
  autoPost: boolean;
  maxReplies?: number; // 今回の実行で投稿する最大件数（省略時は無制限）
  adhocKeyword?: string; // 手動お試し用
  maxKeywords?: number; // 検索に使うキーワード数の上限
  maxPostAgeHours?: number; // これより古い投稿は対象外
  skipAuthorDays?: number; // 直近N日以内に返信した投稿者は対象外
  replyDelayMs?: number; // 返信と返信の間の待機
  deadline?: number; // Date.now() がこれを超えたら打ち切り
};

export type RunEngagementResult =
  | {
      ok: true;
      searched: number;
      candidates: Row[];
      postedCount: number;
      message?: string;
      lastError?: string;
    }
  | { ok: false; status: number; error: string };

// 「検索 → AI判定 → 保存 → （必要なら）投稿」を1ユーザー分実行する。
// 手動ボタン（search route）と自動実行（auto-run route）の両方から使う。
export async function runEngagementForUser(
  p: RunEngagementParams
): Promise<RunEngagementResult> {
  const { supabase, openai, userId, profile, settings, autoPost } = p;
  const maxReplies = p.maxReplies ?? Number.POSITIVE_INFINITY;

  const manualKeywords: string[] = settings?.keywords ?? [];
  const targetPersona: string = settings?.target_persona ?? "";
  const commentMode: "ai" | "template" =
    settings?.comment_mode === "template" ? "template" : "ai";
  const commentTemplates: string[] = settings?.comment_templates ?? [];

  if (commentMode === "template" && commentTemplates.length === 0) {
    return {
      ok: false,
      status: 400,
      error:
        "定型文モードが選択されていますが、定型文が1件も登録されていません。設定画面で定型文を登録してください。",
    };
  }

  // ---- キーワード決定 ----
  let keywords: string[] = [];

  if (p.adhocKeyword) {
    keywords = [p.adhocKeyword];
  } else {
    let personaKeywords: string[] = [];

    if (targetPersona) {
      try {
        personaKeywords = await expandPersonaToKeywords(openai, targetPersona);
      } catch (e) {
        console.error("expandPersonaToKeywords error:", e);
      }
    }

    keywords = Array.from(new Set([...personaKeywords, ...manualKeywords]));
  }

  if (p.maxKeywords) keywords = keywords.slice(0, p.maxKeywords);

  if (keywords.length === 0) {
    return {
      ok: false,
      status: 400,
      error:
        "検索条件が設定されていません。設定画面で「探している投稿者像」またはキーワードを登録してください。",
    };
  }

  const searchType: "TOP" | "RECENT" = settings?.search_type ?? "RECENT";
  const excludeAuthors: string[] = (settings?.exclude_authors ?? []).map(
    (a: string) => a.toLowerCase()
  );
  const maxCandidates: number = settings?.max_candidates_per_run ?? 10;

  // ---- 重複回避用データ ----
  const { data: existing } = await supabase
    .from("engagement_candidates")
    .select("threads_post_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1000);

  const existingIds = new Set(
    (existing ?? []).map((r: { threads_post_id: string }) => r.threads_post_id)
  );

  const recentAuthors = new Set<string>();

  if (p.skipAuthorDays) {
    const since = new Date(
      Date.now() - p.skipAuthorDays * 24 * 60 * 60 * 1000
    ).toISOString();

    const { data: postedRows } = await supabase
      .from("engagement_candidates")
      .select("author_username")
      .eq("user_id", userId)
      .eq("status", "posted")
      .gte("created_at", since);

    for (const r of postedRows ?? []) {
      if (r.author_username) {
        recentAuthors.add(String(r.author_username).toLowerCase());
      }
    }
  }

  const ownUsername = (profile.threads_username ?? "").toLowerCase();

  // ---- 検索 ----
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
        Math.min(maxCandidates * 3, 50)
      );

      for (const post of results) {
        const username = (post.username ?? "").toLowerCase();

        if (!post.text) continue;
        if (post.is_reply) continue;
        if (existingIds.has(post.id)) continue;
        if (username && username === ownUsername) continue;
        if (username && excludeAuthors.includes(username)) continue;
        if (username && recentAuthors.has(username)) continue;

        if (p.maxPostAgeHours && post.timestamp) {
          const ageMs = Date.now() - new Date(post.timestamp).getTime();
          if (ageMs > p.maxPostAgeHours * 60 * 60 * 1000) continue;
        }

        rawCandidates.push({
          keyword,
          id: post.id,
          text: post.text,
          permalink: post.permalink,
          timestamp: post.timestamp,
          username: post.username,
        });

        existingIds.add(post.id);
        // 同じ実行内で同じ人に複数返信しない
        if (p.skipAuthorDays && username) recentAuthors.add(username);
      }
    } catch (searchError) {
      console.error(`keyword_search error (${keyword}):`, searchError);
    }
  }

  const targets = rawCandidates.slice(0, maxCandidates);

  if (targets.length === 0) {
    return {
      ok: true,
      searched: 0,
      candidates: [],
      postedCount: 0,
      message:
        "条件に合う新しい投稿が見つかりませんでした。キーワードや除外設定を見直してみてください。",
    };
  }

  // ---- 判定 → 保存 → 投稿 ----
  const saved: Row[] = [];
  let postedCount = 0;
  let consecutiveFailures = 0;
  let lastError: string | undefined;

  for (const target of targets) {
    if (p.deadline && Date.now() > p.deadline) break;
    if (autoPost && postedCount >= maxReplies) break; // 残りは次回以降に回す
    if (autoPost && consecutiveFailures >= 2) break; // 連続失敗時は中断

    let judged: JudgeAndDraftResult;

    try {
      if (commentMode === "template") {
        judged = await judgeAndSelectTemplate(openai, {
          postText: target.text,
          authorUsername: target.username,
          judgeCriteria: settings?.judge_criteria ?? null,
          replyTone: settings?.reply_tone ?? null,
          userTopics: profile.topics ?? null,
          userForbiddenTopics: profile.forbidden_topics ?? null,
          targetPersona: targetPersona || null,
          templates: commentTemplates,
        });
      } else {
        judged = await judgeAndDraftComment(openai, {
          postText: target.text,
          authorUsername: target.username,
          judgeCriteria: settings?.judge_criteria ?? null,
          replyTone: settings?.reply_tone ?? null,
          userTopics: profile.topics ?? null,
          userForbiddenTopics: profile.forbidden_topics ?? null,
          targetPersona: targetPersona || null,
        });
      }
    } catch (aiError) {
      console.error("judge error:", aiError);
      judged = {
        shouldReply: false,
        reason: "AI判定中にエラーが発生しました。",
        comment: null,
      };
    }

    // ★ 先にDBへ保存する（unique制約が「処理済みロック」になる）
    const { data: row, error: insertError } = await supabase
      .from("engagement_candidates")
      .insert({
        user_id: userId,
        keyword: target.keyword,
        threads_post_id: target.id,
        author_username: target.username,
        post_text: target.text,
        permalink: target.permalink,
        post_created_at: target.timestamp,
        judge_passed: judged.shouldReply,
        judge_reason: judged.reason,
        comment_draft: judged.comment,
        status: judged.shouldReply ? "pending" : "rejected",
      })
      .select()
      .single();

    if (insertError || !row) {
      // 23505 = 別の実行がすでに処理済み。投稿せずに次へ
      if (insertError?.code !== "23505") {
        console.error("engagement_candidates insert error:", insertError);
      }
      continue;
    }

    let result: Row = row;

    if (judged.shouldReply && autoPost && judged.comment) {
      try {
        const replyPostId = await postReplyToThreads(
          profile.threads_user_id,
          profile.threads_access_token,
          target.id,
          judged.comment
        );

        const { data: updated } = await supabase
          .from("engagement_candidates")
          .update({
            status: "posted",
            reply_post_id: replyPostId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id)
          .select()
          .single();

        result = updated ?? { ...row, status: "posted", reply_post_id: replyPostId };
        postedCount++;
        consecutiveFailures = 0;

        if (p.replyDelayMs && postedCount < maxReplies) {
          await sleep(p.replyDelayMs);
        }
      } catch (postError) {
        console.error("auto post reply error:", postError);
        const message =
          postError instanceof Error ? postError.message : "投稿に失敗しました。";

        lastError = message;
        consecutiveFailures++;

        const { data: updated } = await supabase
          .from("engagement_candidates")
          .update({
            status: "failed",
            error_message: message,
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id)
          .select()
          .single();

        result = updated ?? { ...row, status: "failed", error_message: message };
      }
    }

    saved.push(result);
  }

  return {
    ok: true,
    searched: targets.length,
    candidates: saved,
    postedCount,
    lastError,
  };
}