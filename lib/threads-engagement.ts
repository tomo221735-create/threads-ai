// 「他ユーザーの投稿を検索 → AIで判定 → AIコメント生成 → 投稿」機能の共通処理。
//
// 手動実行API（/api/threads/engagement/search）と
// 自動実行cron（/api/threads/engagement/auto-run）の両方から使われる。

import OpenAI from "openai";

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
}