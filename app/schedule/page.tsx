"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";

type ScheduledPost = {
  id: string;
  content: string;
  scheduled_at: string;
  status: "pending" | "processing" | "success" | "failed" | "expired";
  post_id: string | null;
  error_message: string | null;
};

const STATUS_LABEL: Record<ScheduledPost["status"], string> = {
  pending: "予約中",
  processing: "投稿処理中",
  success: "投稿済み",
  failed: "失敗",
  expired: "期限切れ（未投稿）",
};

const STATUS_STYLE: Record<ScheduledPost["status"], string> = {
  pending: "bg-accent-cyan/10 text-accent-cyan",
  processing: "bg-accent-violet/10 text-accent-violet",
  success: "bg-emerald-500/10 text-emerald-300",
  failed: "bg-red-500/10 text-red-300",
  expired: "bg-surface-raised text-text-muted",
};

// datetime-local の value（ローカル時刻）を扱いやすくするためのヘルパー
function toDatetimeLocalValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

export default function SchedulePage() {
  const router = useRouter();

  const [content, setContent] = useState("");
  const [scheduledAt, setScheduledAt] = useState(() => {
    const d = new Date(Date.now() + 60 * 60 * 1000); // デフォルトは1時間後
    return toDatetimeLocalValue(d);
  });

  const [posts, setPosts] = useState<ScheduledPost[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    loadPosts();
  }, []);

  const loadPosts = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push("/login");
      return;
    }

    const { data, error } = await supabase
      .from("scheduled_posts")
      .select("*")
      .order("scheduled_at", { ascending: true });

    if (error) {
      console.error(error);
      setError("予約投稿の読み込みに失敗しました。");
    } else {
      setPosts((data ?? []) as ScheduledPost[]);
    }

    setLoading(false);
  };

  const createScheduledPost = async () => {
    setMessage("");
    setError("");

    if (!content.trim()) {
      setError("投稿内容を入力してください。");
      return;
    }

    const scheduledDate = new Date(scheduledAt);

    if (Number.isNaN(scheduledDate.getTime())) {
      setError("日時を正しく入力してください。");
      return;
    }

    if (scheduledDate.getTime() <= Date.now()) {
      setError("未来の日時を選択してください。");
      return;
    }

    setSaving(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("ログインしてください。");
      setSaving(false);
      return;
    }

    const { error: insertError } = await supabase
      .from("scheduled_posts")
      .insert({
        user_id: user.id,
        content: content.trim(),
        scheduled_at: scheduledDate.toISOString(),
        status: "pending",
      });

    if (insertError) {
      console.error(insertError);
      setError("予約の作成に失敗しました。");
    } else {
      setMessage("予約投稿を作成しました！");
      setContent("");
      await loadPosts();
    }

    setSaving(false);
  };

  const cancelPost = async (id: string) => {
    const { error } = await supabase
      .from("scheduled_posts")
      .delete()
      .eq("id", id)
      .eq("status", "pending");

    if (error) {
      console.error(error);
      setError("予約の取り消しに失敗しました。");
    } else {
      await loadPosts();
    }
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center text-text-muted">
        読み込み中...
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-2xl">

        <button
          onClick={() => router.push("/")}
          className="mb-6 text-sm text-text-muted transition hover:text-accent-cyan"
        >
          ← 戻る
        </button>

        <h1 className="text-3xl font-bold text-text-primary">予約投稿</h1>

        <p className="mt-2 text-text-muted">
          自分で書いた内容を、指定した日時にThreadsへ投稿します。
        </p>

        <div className="mt-3 rounded-xl border border-accent-violet/30 bg-accent-violet/10 p-3 text-xs leading-5 text-accent-violet">
          ⚠️「⚙️ 設定」の<strong>全自動投稿</strong>とは別の機能です。全自動投稿はAIが内容・時間の両方を自動で決めますが、
          こちらの予約投稿は<strong>内容はあなたが書き、時間だけ指定して投稿を予約する</strong>機能です。
          実行チェックは数分〜15分間隔で行われるため、予定時刻ちょうどではなく前後数分〜十数分ずれて投稿されることがあります。
        </div>

        {/* 予約フォーム */}
        <section className="mt-6 space-y-4 rounded-2xl border border-border-soft bg-surface p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">

          <div>
            <label className="mb-2 block font-semibold text-text-primary">
              投稿内容
            </label>

            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={5}
              maxLength={500}
              placeholder="投稿したい内容をそのまま書いてください（500文字以内）"
              className="w-full resize-none rounded-xl border border-border-soft bg-surface-raised p-3 text-text-primary outline-none transition focus:border-accent-cyan/50"
            />

            <p className="mt-1 text-right text-xs text-text-muted">
              {content.length} / 500
            </p>
          </div>

          <div>
            <label className="mb-2 block font-semibold text-text-primary">
              投稿する日時
            </label>

            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="w-full rounded-xl border border-border-soft bg-surface-raised p-3 text-text-primary outline-none transition focus:border-accent-cyan/50 [color-scheme:dark]"
            />
          </div>

          <button
            onClick={createScheduledPost}
            disabled={saving}
            className="w-full rounded-xl bg-gradient-to-r from-accent-cyan to-accent-violet px-5 py-4 font-bold text-[#06110d] shadow-[0_0_20px_rgba(79,243,208,0.25)] transition active:scale-[0.98] disabled:opacity-50"
          >
            {saving ? "予約中..." : "この内容で予約する"}
          </button>

          {message && (
            <div className="rounded-xl border border-accent-cyan/20 bg-accent-cyan/10 p-4 text-sm text-accent-cyan">
              {message}
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
              {error}
            </div>
          )}

        </section>

        {/* 予約一覧 */}
        <section className="mt-8">
          <h2 className="mb-3 font-bold text-text-primary">予約一覧</h2>

          {posts.length === 0 ? (
            <p className="text-sm text-text-muted">
              予約された投稿はまだありません。
            </p>
          ) : (
            <div className="space-y-3">
              {posts.map((post) => (
                <div
                  key={post.id}
                  className="rounded-2xl border border-border-soft bg-surface p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-semibold text-text-primary">
                      {new Date(post.scheduled_at).toLocaleString("ja-JP")}
                    </span>

                    <span
                      className={`rounded-full px-3 py-1 text-xs font-bold ${
                        STATUS_STYLE[post.status]
                      }`}
                    >
                      {STATUS_LABEL[post.status]}
                    </span>
                  </div>

                  <p className="whitespace-pre-wrap text-sm text-text-muted">
                    {post.content}
                  </p>

                  {post.status === "failed" && post.error_message && (
                    <p className="mt-2 text-xs text-red-300">
                      エラー: {post.error_message}
                    </p>
                  )}

                  {post.status === "pending" && (
                    <button
                      onClick={() => cancelPost(post.id)}
                      className="mt-3 rounded-xl border border-border-soft px-3 py-2 text-xs text-text-muted transition hover:border-red-400/50 hover:text-red-300"
                    >
                      予約を取り消す
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}