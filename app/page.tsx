"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useRouter } from "next/navigation";

// AIの出力（【ネタ1】〜【ネタ10】区切り、または「1. 」形式の番号付きリスト）を
// 1つずつのネタ配列に分割する
function parseIdeas(rawText: string): string[] {
  const text = (rawText || "").trim();

  // 「【ネタ1】」のような見出し区切りをまず試す
  const byHeading = text
    .split(/\n(?=【\s*ネタ\s*\d+\s*】)/)
    .map((idea) => idea.replace(/^【\s*ネタ\s*\d+\s*】\s*/, "").trim())
    .filter(Boolean);

  if (byHeading.length > 1) {
    return byHeading;
  }

  // 「1. 」「1．」「1、」のような番号付きリストにフォールバック
  const byNumber = text
    .split(/\n(?=\d+[.．、])/)
    .map((idea) => idea.replace(/^\d+[.．、]\s*/, "").trim())
    .filter(Boolean);

  return byNumber;
}

export default function Home() {
  const router = useRouter();
  const [theme, setTheme] = useState("");
  const [target, setTarget] = useState("");
  

  const [posts, setPosts] = useState<string[]>([]);
  const [ideas, setIdeas] = useState<string[]>([]);
  const [selectedIdeaIndex, setSelectedIdeaIndex] = useState<number | null>(
    null
  );

  const [loading, setLoading] = useState(false);
  const [ideasLoading, setIdeasLoading] = useState(false);
  const [saving, setSaving] = useState<number | null>(null);
const [posting, setPosting] = useState<number | null>(null);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [threadsUsername, setThreadsUsername] = useState<string | null>(null);
const [threadsLoading, setThreadsLoading] = useState(true);

  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  type AnalyzedPost = {
    threads_post_id: string;
    text: string;
    permalink: string | null;
    likes: number;
    replies: number;
    reposts: number;
    quotes: number;
    views: number;
    engagement_score: number;
  };

  const [analysisSummary, setAnalysisSummary] = useState<string | null>(null);
  const [analysisTopPosts, setAnalysisTopPosts] = useState<AnalyzedPost[]>([]);
  const [analysisStats, setAnalysisStats] = useState<{
    postCount: number;
    avgLikes: number;
    avgReplies: number;
    avgReposts: number;
    avgViews: number;
  } | null>(null);
  const [analysisUpdatedAt, setAnalysisUpdatedAt] = useState<string | null>(
    null
  );
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [analysisNeedsReconnect, setAnalysisNeedsReconnect] = useState(false);

useEffect(() => {
  const checkThreadsConnection = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      setUserEmail(user?.email ?? null);
      setAuthLoading(false);

      if (!user) {
        setThreadsLoading(false);
        return;
      }

            const { data, error } = await supabase
        .from("profiles")
        .select(
          "threads_username, analysis_summary, analysis_stats, analysis_updated_at"
        )
        .eq("id", user.id)
        .maybeSingle();

      if (error) {
        console.error(error);
      } else {
        setThreadsUsername(data?.threads_username ?? null);
        setAnalysisSummary(data?.analysis_summary ?? null);
        setAnalysisStats(data?.analysis_stats ?? null);
        setAnalysisUpdatedAt(data?.analysis_updated_at ?? null);
      }
    } catch (error) {
      console.error(error);
      setAuthLoading(false);
    } finally {
      setThreadsLoading(false);
    }
  };

  checkThreadsConnection();
}, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUserEmail(null);
    setThreadsUsername(null);
  };

  const generatePosts = async () => {
    if (!theme || !target) {
      setError("テーマとターゲットを入力してください。");
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");
    setPosts([]);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setError("ログインしてください。");
        setLoading(false);
        return;
      }

      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          theme,
          target,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "生成に失敗しました");
      }

      const generatedPosts = data.result
        .split(/\n(?=\d+[.．、])/)
        .map((post: string) =>
          post.replace(/^\d+[.．、]\s*/, "").trim()
        )
        .filter(Boolean);

      setPosts(generatedPosts);
    } catch (err) {
      console.error(err);
      setError("投稿の生成に失敗しました。");
    } finally {
      setLoading(false);
    }
  };

  const generateIdeas = async () => {
    if (!theme || !target) {
      setError("テーマとターゲットを入力してください。");
      return;
    }

    setIdeasLoading(true);
    setError("");
    setMessage("");
    setIdeas([]);
    setSelectedIdeaIndex(null);
    setPosts([]);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setError("ログインしてください。");
        setIdeasLoading(false);
        return;
      }

      const response = await fetch("/api/generate-ideas", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          theme,
          target,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "投稿ネタの取得に失敗しました"
        );
      }

      const generatedIdeas = parseIdeas(data.result);

      setIdeas(generatedIdeas);
    } catch (err) {
      console.error(err);
      setError("投稿ネタの取得に失敗しました。");
    } finally {
      setIdeasLoading(false);
    }
  };

  const selectIdea = (index: number) => {
    setSelectedIdeaIndex(index);
  };

  const createPostFromSelectedIdea = async () => {
    if (selectedIdeaIndex === null) {
      setError("ネタを選択してください。");
      return;
    }

    const idea = ideas[selectedIdeaIndex];
    setTheme(idea);
    setIdeas([]);
    setSelectedIdeaIndex(null);

    await generatePostsWithTheme(idea);
  };

  const generatePostsWithTheme = async (selectedTheme: string) => {
    if (!selectedTheme || !target) {
      setError("ターゲットを入力してください。");
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");
    setPosts([]);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setError("ログインしてください。");
        setLoading(false);
        return;
      }

      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          theme: selectedTheme,
          target,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "生成に失敗しました");
      }

      const generatedPosts = data.result
        .split(/\n(?=\d+[.．、])/)
        .map((post: string) =>
          post.replace(/^\d+[.．、]\s*/, "").trim()
        )
        .filter(Boolean);

      setPosts(generatedPosts);
    } catch (err) {
      console.error(err);
      setError("投稿の生成に失敗しました。");
    } finally {
      setLoading(false);
    }
  };

  const updatePost = (index: number, value: string) => {
    const newPosts = [...posts];
    newPosts[index] = value;
    setPosts(newPosts);
  };

  const savePost = async (index: number) => {
    setSaving(index);
    setMessage("");
    setError("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("ログインしてください。");
      setSaving(null);
      return;
    }



    const { error } = await supabase.from("posts").insert({
      user_id: user.id,
      content: posts[index],
      status: "draft",
    });

    if (error) {
      console.error(error);
      setError("保存に失敗しました。");
    } else {
      setMessage(`投稿 ${index + 1} を保存しました！`);
    }

    setSaving(null);
  };

      const postToThreads = async (index: number) => {
  setPosting(index);
  setMessage("");
  setError("");

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("ログインしてください。");
      return;
    }

    const response = await fetch("/api/threads/post", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content: posts[index],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error || "Threadsへの投稿に失敗しました。"
      );
    }

    setMessage(`投稿 ${index + 1} をThreadsに投稿しました！`);
  } catch (error) {
    console.error(error);
    setError(
      error instanceof Error
        ? error.message
        : "Threadsへの投稿に失敗しました。"
    );
  } finally {
    setPosting(null);
  }
};

   const runAnalysis = async () => {
    setAnalysisLoading(true);
    setAnalysisError("");
    setAnalysisNeedsReconnect(false);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setAnalysisError("ログインしてください。");
        setAnalysisLoading(false);
        return;
      }

      const response = await fetch("/api/threads/analyze", {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.needsReconnect) {
          setAnalysisNeedsReconnect(true);
        }
        throw new Error(data.error || "分析に失敗しました。");
      }

      setAnalysisSummary(data.summary ?? null);
      setAnalysisTopPosts(data.topPosts ?? []);
      setAnalysisStats(data.stats ?? null);
      setAnalysisUpdatedAt(data.updatedAt ?? null);

      if (data.message) {
        setAnalysisError(data.message);
      }
    } catch (err) {
      console.error(err);
      setAnalysisError(
        err instanceof Error ? err.message : "分析に失敗しました。"
      );
    } finally {
      setAnalysisLoading(false);
    }
  };

  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 sm:py-10">      <div className="mx-auto max-w-3xl">

        {/* ヘッダー */}
        <header className="mb-7">
          <div className="flex items-start justify-between gap-3">
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-accent-cyan/30 bg-accent-cyan/10 px-3 py-1 text-xs font-semibold tracking-wide text-accent-cyan">
              <span className="h-1.5 w-1.5 rounded-full bg-accent-cyan shadow-[0_0_8px_2px_rgba(79,243,208,0.7)]" />
              AI SNS ASSISTANT
            </div>

            {/* ログイン／プロフィール／設定ボタン */}
            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={() => router.push("/profile")}
                className="rounded-full border border-border-soft bg-surface px-3 py-1.5 text-xs font-semibold text-text-primary shadow-sm transition hover:border-accent-cyan/40 active:scale-[0.98]"
              >
                👤 プロフィール
              </button>

              <button
                onClick={() => router.push("/schedule")}
                className="rounded-full border border-border-soft bg-surface px-3 py-1.5 text-xs font-semibold text-text-primary shadow-sm transition hover:border-accent-violet/40 active:scale-[0.98]"
              >
                🗓️ 予約投稿
              </button>

              <button
                onClick={() => router.push("/analytics")}
                className="rounded-full border border-border-soft bg-surface px-3 py-1.5 text-xs font-semibold text-text-primary shadow-sm transition hover:border-accent-violet/40 active:scale-[0.98]"
              >
                📊 分析
              </button>

              <button
                onClick={() => router.push("/settings")}
                className="rounded-full border border-border-soft bg-surface px-3 py-1.5 text-xs font-semibold text-text-primary shadow-sm transition hover:border-accent-cyan/40 active:scale-[0.98]"
              >
                ⚙️ 設定
              </button>

              {authLoading ? (
                <span className="rounded-full bg-surface px-3 py-1.5 text-xs font-semibold text-text-faint">
                  確認中...
                </span>
              ) : userEmail ? (
                <button
                  onClick={handleLogout}
                  className="rounded-full border border-border-soft bg-surface px-3 py-1.5 text-xs font-semibold text-text-primary shadow-sm transition hover:border-accent-cyan/40 active:scale-[0.98]"
                >
                  ログアウト
                </button>
              ) : (
                <button
                  onClick={() => router.push("/login")}
                  className="rounded-full bg-accent-cyan px-3 py-1.5 text-xs font-bold text-[#06110d] shadow-[0_0_16px_rgba(79,243,208,0.35)] transition active:scale-[0.98]"
                >
                  ログイン
                </button>
              )}
            </div>
          </div>

          <h1 className="text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">
            Threads AI
          </h1>

          <p className="mt-2 text-sm leading-6 text-text-muted sm:text-base">
            あなたのプロフィールと最新情報から、
            今日投稿するネタをAIが考えます。
          </p>

          {userEmail && !authLoading && (
            <p className="mt-2 text-xs text-text-faint">
              ログイン中：{userEmail}
            </p>
          )}
        </header>

{/* Threads連携 */}
<section className="mb-6 rounded-2xl border border-border-soft bg-surface p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)] sm:p-6">
  <div className="flex items-center justify-between gap-4">
    <div>
      <h2 className="font-bold text-text-primary">
        Threadsアカウント
      </h2>

      <p className="mt-1 text-sm text-text-muted">
        生成した投稿をThreadsへ投稿できます。
      </p>
    </div>

    <div className="shrink-0">
      {threadsLoading ? (
        <span className="rounded-full bg-surface-raised px-3 py-1 text-xs font-semibold text-text-muted">
          確認中...
        </span>
      ) : threadsUsername ? (
        <span className="rounded-full border border-accent-cyan/30 bg-accent-cyan/10 px-3 py-1 text-xs font-semibold text-accent-cyan">
          ✓ 連携済み
        </span>
      ) : (
        <span className="rounded-full bg-surface-raised px-3 py-1 text-xs font-semibold text-text-muted">
          未連携
        </span>
      )}
    </div>
  </div>

  {threadsLoading ? (
    <div className="mt-5 rounded-xl bg-surface-raised p-4 text-sm text-text-muted">
      Threads連携状況を確認しています...
    </div>
  ) : threadsUsername ? (
    <div className="mt-5 rounded-xl border border-accent-cyan/20 bg-accent-cyan/5 p-4">
      <p className="text-sm font-semibold text-accent-cyan">
        ✓ Threadsアカウントと連携されています
      </p>

      <p className="mt-1 text-sm text-text-primary">
        @{threadsUsername}
      </p>
    </div>
   ) : (
    <button
      onClick={async () => {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          setError("ログインしてください。");
          return;
        }

        window.location.href =
          `/api/threads/login?userId=${encodeURIComponent(user.id)}`;
      }}
      className="mt-5 w-full rounded-xl bg-accent-cyan px-5 py-3.5 text-sm font-bold text-[#06110d] shadow-[0_0_20px_rgba(79,243,208,0.3)] transition active:scale-[0.98]"
    >
      Threadsと連携する
    </button>
  )}

    {/* 連携状態に関わらず常に表示 */}
  <button
    onClick={() => router.push("/settings")}
    className="mt-3 w-full rounded-xl border border-border-soft bg-surface-raised px-5 py-3.5 text-sm font-bold text-text-primary shadow-sm transition hover:border-accent-violet/40 active:scale-[0.98]"
  >
    ⚙️ 自動投稿設定
  </button>
</section>

        {/* 過去の投稿分析 */}
        <section className="mb-6 rounded-2xl border border-border-soft bg-surface p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)] sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-bold text-text-primary">
                📊 過去の投稿分析
              </h2>

              <p className="mt-1 text-sm text-text-muted">
                反応が良かった投稿の傾向を分析し、次の投稿づくりに活かします。
              </p>
            </div>
          </div>

          <button
            onClick={runAnalysis}
            disabled={analysisLoading || !threadsUsername}
            className="mt-5 w-full rounded-xl bg-gradient-to-r from-accent-cyan to-accent-violet px-5 py-3.5 text-sm font-bold text-[#06110d] shadow-[0_0_20px_rgba(79,243,208,0.25)] transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {analysisLoading
              ? "分析中...（少し時間がかかります）"
              : analysisSummary
              ? "最新の投稿で分析を更新する"
              : "過去の投稿を分析する"}
          </button>

          {!threadsUsername && (
            <p className="mt-3 text-xs text-text-faint">
              Threadsと連携すると分析できるようになります。
            </p>
          )}

          {analysisError && (
            <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm leading-6 text-red-300">
              {analysisError}

              {analysisNeedsReconnect && (
                <button
                  onClick={async () => {
                    const {
                      data: { user },
                    } = await supabase.auth.getUser();

                    if (!user) return;

                    window.location.href =
                      `/api/threads/login?userId=${encodeURIComponent(user.id)}`;
                  }}
                  className="mt-3 block w-full rounded-xl border border-red-400/30 bg-surface-raised px-4 py-2.5 text-center text-sm font-semibold text-text-primary transition hover:border-accent-cyan/40"
                >
                  Threadsを再連携する（分析の権限を追加）
                </button>
              )}
            </div>
          )}

          {analysisStats && (
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatBox label="分析した投稿数" value={analysisStats.postCount} />
              <StatBox label="平均いいね" value={analysisStats.avgLikes} />
              <StatBox label="平均返信" value={analysisStats.avgReplies} />
              <StatBox label="平均閲覧数" value={analysisStats.avgViews} />
            </div>
          )}

          {analysisSummary && (
            <div className="mt-5 rounded-xl border border-accent-cyan/20 bg-accent-cyan/5 p-4">
              <p className="mb-2 text-xs font-bold text-accent-cyan">
                AIによる傾向分析
              </p>

              <p className="whitespace-pre-wrap text-sm leading-7 text-text-primary">
                {analysisSummary}
              </p>

              {analysisUpdatedAt && (
                <p className="mt-3 text-xs text-text-faint">
                  最終分析：
                  {new Date(analysisUpdatedAt).toLocaleString("ja-JP")}
                </p>
              )}
            </div>
          )}

          {analysisTopPosts.length > 0 && (
            <div className="mt-5">
              <p className="mb-3 text-xs font-bold text-text-muted">
                反応が良かった投稿 TOP{Math.min(analysisTopPosts.length, 5)}
              </p>

              <div className="space-y-3">
                {analysisTopPosts.map((post, index) => (
                  <div
                    key={post.threads_post_id}
                    className="rounded-xl border border-border-soft bg-surface-raised p-4"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-bold text-accent-violet">
                        #{index + 1}
                      </span>

                      <span className="text-xs text-text-faint">
                        ❤️{post.likes} 💬{post.replies} 🔁{post.reposts} 👀
                        {post.views}
                      </span>
                    </div>

                    <p className="line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-text-primary">
                      {post.text}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* 入力カード */}
        <section className="rounded-2xl border border-border-soft bg-surface p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)] sm:p-7">

          <div className="mb-6">
            <h2 className="text-lg font-bold text-text-primary">
              投稿設定
            </h2>

            <p className="mt-1 text-sm text-text-muted">
              発信したい内容と、届けたい相手を入力してください。
            </p>
          </div>

          {/* テーマ */}
          <div className="mb-5">
            <label className="mb-2 block text-sm font-semibold text-text-primary">
              発信テーマ
            </label>

            <input
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              placeholder="例：AIを使った副業"
              className="w-full rounded-xl border border-border-soft bg-surface-raised px-4 py-3.5 text-base text-text-primary placeholder:text-text-faint outline-none transition focus:border-accent-cyan/50 focus:shadow-[0_0_0_3px_rgba(79,243,208,0.12)]"
            />
          </div>

          {/* ターゲット */}
          <div className="mb-6">
            <label className="mb-2 block text-sm font-semibold text-text-primary">
              ターゲット
            </label>

            <input
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="例：AIを使って副業を始めたい大学生"
              className="w-full rounded-xl border border-border-soft bg-surface-raised px-4 py-3.5 text-base text-text-primary placeholder:text-text-faint outline-none transition focus:border-accent-cyan/50 focus:shadow-[0_0_0_3px_rgba(79,243,208,0.12)]"
            />
          </div>

          {/* メインボタン */}
          <button
            onClick={generateIdeas}
            disabled={ideasLoading || loading}
            className="w-full rounded-xl bg-gradient-to-r from-accent-cyan to-accent-violet px-5 py-4 text-base font-bold text-[#06110d] shadow-[0_0_24px_rgba(79,243,208,0.25)] transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {ideasLoading
              ? "🔎 今日のネタを探しています..."
              : "🔥 今日の投稿ネタを探す"}
          </button>

          {/* 通常生成 */}
          <button
            onClick={generatePosts}
            disabled={loading || ideasLoading}
            className="mt-3 w-full rounded-xl border border-border-soft bg-surface-raised px-5 py-3.5 text-sm font-semibold text-text-primary transition hover:border-accent-violet/40 active:scale-[0.98] disabled:opacity-50"
          >
            {loading
              ? "AIが生成中..."
              : "テーマから直接投稿を作る"}
          </button>

          {/* エラー */}
          {error && (
            <div className="mt-5 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm leading-6 text-red-300">
              {error}
            </div>
          )}

          {/* 成功メッセージ */}
          {message && (
            <div className="mt-5 rounded-xl border border-accent-cyan/20 bg-accent-cyan/10 p-4 text-sm leading-6 text-accent-cyan">
              {message}
            </div>
          )}
        </section>

        {/* 今日のネタ */}
        {ideas.length > 0 && (
          <section className="mt-8">

            <div className="mb-4">
              <div className="flex items-center gap-2">
                <span className="text-xl">🔥</span>

                <h2 className="text-xl font-bold text-text-primary">
                  今日使える投稿ネタ
                </h2>
              </div>

              <p className="mt-1 text-sm text-text-muted">
                あなたのプロフィールと最新情報からAIが選びました。気に入ったネタを1つ選んでください。
              </p>
            </div>

            <div className="space-y-4">

              {ideas.map((idea, index) => {
                const isSelected = selectedIdeaIndex === index;

                return (
                  <article
                    key={index}
                    onClick={() => selectIdea(index)}
                    role="button"
                    aria-pressed={isSelected}
                    className={`cursor-pointer rounded-2xl border p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)] transition sm:p-6 ${
                      isSelected
                        ? "border-accent-cyan bg-surface-raised shadow-[0_0_0_1px_rgba(79,243,208,0.4)]"
                        : "border-border-soft bg-surface hover:border-accent-cyan/40"
                    }`}
                  >

                    <div className="mb-4 flex items-center justify-between">
                      <span className="rounded-full bg-surface-raised px-3 py-1 text-xs font-bold text-accent-violet">
                        ネタ {index + 1}
                      </span>

                      {isSelected && (
                        <span className="rounded-full bg-accent-cyan/15 px-3 py-1 text-xs font-bold text-accent-cyan">
                          ✓ 選択中
                        </span>
                      )}
                    </div>

                    <div className="whitespace-pre-wrap text-sm leading-7 text-text-primary sm:text-base">
                      {idea}
                    </div>

                  </article>
                );
              })}

            </div>

            <button
              onClick={createPostFromSelectedIdea}
              disabled={loading || selectedIdeaIndex === null}
              className="sticky bottom-4 mt-6 w-full rounded-xl bg-gradient-to-r from-accent-cyan to-accent-violet px-5 py-4 text-base font-bold text-[#06110d] shadow-[0_0_24px_rgba(79,243,208,0.3)] transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading
                ? "投稿を作成中..."
                : selectedIdeaIndex === null
                ? "ネタを選んでください"
                : `選んだネタで投稿を作る →`}
            </button>
          </section>
        )}

        {/* 生成された投稿 */}
        {posts.length > 0 && (
          <section className="mt-10">

            <div className="mb-4">
              <h2 className="text-xl font-bold text-text-primary">
                ✍️ 生成された投稿
              </h2>

              <p className="mt-1 text-sm text-text-muted">
                必要なら文章を編集してから保存できます。
              </p>
            </div>

            <div className="space-y-5">

              {posts.map((post, index) => (
                <article
                  key={index}
                  className="rounded-2xl border border-border-soft bg-surface p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)] sm:p-6"
                >

                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-sm font-bold text-text-muted">
                      投稿 {index + 1}
                    </span>

                    <span className="text-xs text-text-faint">
                      下書き
                    </span>
                  </div>

                  <textarea
                    value={post}
                    onChange={(e) =>
                      updatePost(index, e.target.value)
                    }
                    rows={7}
                    className="w-full resize-y rounded-xl border border-border-soft bg-surface-raised p-4 text-sm leading-7 text-text-primary outline-none transition focus:border-accent-cyan/50 focus:shadow-[0_0_0_3px_rgba(79,243,208,0.12)] sm:text-base"
                  />

                  <div className="mt-4 grid grid-cols-3 gap-3">

                    <button
                      onClick={() => savePost(index)}
                      disabled={saving === index}
                      className="rounded-xl bg-accent-violet px-4 py-3 font-semibold text-[#0c0820] shadow-[0_0_16px_rgba(139,124,255,0.3)] transition active:scale-[0.98] disabled:opacity-50"
                    >
                      {saving === index
                        ? "保存中..."
                        : "保存"}
                    </button>

                    <button
                      onClick={() =>
                        navigator.clipboard.writeText(post)
                      }
                      className="rounded-xl border border-border-soft bg-surface-raised px-4 py-3 font-semibold text-text-primary transition hover:border-accent-cyan/40 active:scale-[0.98]"
                    >
                      コピー
                    </button>

                    <button
  onClick={() => postToThreads(index)}
  disabled={posting === index}
  className="rounded-xl bg-accent-cyan px-4 py-3 font-semibold text-[#06110d] shadow-[0_0_16px_rgba(79,243,208,0.3)] transition active:scale-[0.98] disabled:opacity-50"
>
  {posting === index
    ? "投稿中..."
    : "Threadsに投稿"}
</button>

                  </div>

                </article>
              ))}

            </div>
          </section>
        )}

        {/* フッター */}
        <footer className="py-10 text-center text-xs text-text-faint">
          Threads AI
        </footer>

            </div>
    </main>
  );
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border-soft bg-surface-raised p-3 text-center">
      <p className="text-lg font-bold text-text-primary">{value}</p>
      <p className="mt-0.5 text-[11px] text-text-muted">{label}</p>
    </div>
  );
}