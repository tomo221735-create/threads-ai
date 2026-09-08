"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";

export default function SettingsPage() {
  const router = useRouter();

  const [enabled, setEnabled] = useState(false);
  const [postsPerDay, setPostsPerDay] = useState(1);
  const [postTime1, setPostTime1] = useState("09:00");
  const [postTime2, setPostTime2] = useState("18:00");
  const [postTime3, setPostTime3] = useState("21:00");

  const [purpose, setPurpose] = useState("フォロワーを増やす");
  const [autoTrend, setAutoTrend] = useState(true);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push("/login");
      return;
    }

    const { data, error } = await supabase
      .from("auto_post_settings")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      console.error(error);
      setError("設定の読み込みに失敗しました。");
      setLoading(false);
      return;
    }

    if (data) {
      setEnabled(data.enabled ?? false);
      setPostsPerDay(data.posts_per_day ?? 1);
      setPostTime1(data.post_time_1?.slice(0, 5) ?? "09:00");
      setPostTime2(data.post_time_2?.slice(0, 5) ?? "18:00");
      setPostTime3(data.post_time_3?.slice(0, 5) ?? "21:00");
      setPurpose(data.purpose ?? "フォロワーを増やす");
      setAutoTrend(data.auto_trend ?? true);
    }

    setLoading(false);
  };

  const saveSettings = async () => {
    setSaving(true);
    setMessage("");
    setError("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("ログインしてください。");
      setSaving(false);
      return;
    }

const { error } = await supabase
  .from("auto_post_settings")
  .upsert(
    {
      user_id: user.id,
      enabled,
      posts_per_day: postsPerDay,
      post_time_1: postsPerDay >= 1 ? postTime1 : null,
      post_time_2: postsPerDay >= 2 ? postTime2 : null,
      post_time_3: postsPerDay >= 3 ? postTime3 : null,
      purpose,
      auto_trend: autoTrend,
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: "user_id",
    }
  );

if (error) {
  console.error("保存エラー:", error);

  setError(
    `設定の保存に失敗しました。\n${error.message}`
  );
} else {
  setMessage("自動投稿設定を保存しました！");
}

setSaving(false);
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

        <h1 className="text-3xl font-bold text-text-primary">
          自動投稿設定
        </h1>

        <p className="mt-2 text-text-muted">
          AIにThreadsの運用を任せるための設定です。
        </p>

        <section className="mt-8 space-y-6 rounded-2xl border border-border-soft bg-surface p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">

          {/* 自動投稿ON/OFF */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-bold text-text-primary">
                自動投稿
              </h2>
              <p className="text-sm text-text-muted">
                ONにするとAIが自動で投稿します。
              </p>
            </div>

            <button
              onClick={() => setEnabled(!enabled)}
              className={`rounded-full px-5 py-2 text-sm font-bold transition ${
                enabled
                  ? "bg-accent-cyan text-[#06110d] shadow-[0_0_16px_rgba(79,243,208,0.3)]"
                  : "bg-surface-raised text-text-muted"
              }`}
            >
              {enabled ? "ON" : "OFF"}
            </button>
          </div>

          {/* 投稿数 */}
          <div>
            <label className="mb-2 block font-semibold text-text-primary">
              1日の投稿数
            </label>

            <select
              value={postsPerDay}
              onChange={(e) =>
                setPostsPerDay(Number(e.target.value))
              }
              className="w-full rounded-xl border border-border-soft bg-surface-raised p-3 text-text-primary outline-none transition focus:border-accent-cyan/50"
            >
              <option value={1}>1日1投稿</option>
              <option value={2}>1日2投稿</option>
              <option value={3}>1日3投稿</option>
            </select>
          </div>

          {/* 投稿時間 */}
          <div>
            <label className="mb-3 block font-semibold text-text-primary">
              投稿時間
            </label>

            <div className="space-y-3">

              {postsPerDay >= 1 && (
                <div>
                  <label className="text-sm text-text-muted">
                    1回目
                  </label>

                  <input
                    type="time"
                    value={postTime1}
                    onChange={(e) =>
                      setPostTime1(e.target.value)
                    }
                    className="mt-1 w-full rounded-xl border border-border-soft bg-surface-raised p-3 text-text-primary outline-none transition focus:border-accent-cyan/50 [color-scheme:dark]"
                  />
                </div>
              )}

              {postsPerDay >= 2 && (
                <div>
                  <label className="text-sm text-text-muted">
                    2回目
                  </label>

                  <input
                    type="time"
                    value={postTime2}
                    onChange={(e) =>
                      setPostTime2(e.target.value)
                    }
                    className="mt-1 w-full rounded-xl border border-border-soft bg-surface-raised p-3 text-text-primary outline-none transition focus:border-accent-cyan/50 [color-scheme:dark]"
                  />
                </div>
              )}

              {postsPerDay >= 3 && (
                <div>
                  <label className="text-sm text-text-muted">
                    3回目
                  </label>

                  <input
                    type="time"
                    value={postTime3}
                    onChange={(e) =>
                      setPostTime3(e.target.value)
                    }
                    className="mt-1 w-full rounded-xl border border-border-soft bg-surface-raised p-3 text-text-primary outline-none transition focus:border-accent-cyan/50 [color-scheme:dark]"
                  />
                </div>
              )}

            </div>
          </div>

          {/* 目的 */}
          <div>
            <label className="mb-2 block font-semibold text-text-primary">
              AIに任せる目的
            </label>

            <select
              value={purpose}
              onChange={(e) =>
                setPurpose(e.target.value)
              }
              className="w-full rounded-xl border border-border-soft bg-surface-raised p-3 text-text-primary outline-none transition focus:border-accent-cyan/50"
            >
              <option>フォロワーを増やす</option>
              <option>認知を広げる</option>
              <option>集客する</option>
              <option>商品・サービスを販売する</option>
              <option>専門家として認知される</option>
            </select>
          </div>

          {/* トレンド */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-bold text-text-primary">
                トレンド分析
              </h2>

              <p className="text-sm text-text-muted">
                最新の話題を分析して投稿テーマを決めます。
              </p>
            </div>

            <button
              onClick={() =>
                setAutoTrend(!autoTrend)
              }
              className={`rounded-full px-5 py-2 text-sm font-bold transition ${
                autoTrend
                  ? "bg-accent-cyan text-[#06110d] shadow-[0_0_16px_rgba(79,243,208,0.3)]"
                  : "bg-surface-raised text-text-muted"
              }`}
            >
              {autoTrend ? "ON" : "OFF"}
            </button>
          </div>

          {/* 保存 */}
          <button
            onClick={saveSettings}
            disabled={saving}
            className="w-full rounded-xl bg-gradient-to-r from-accent-cyan to-accent-violet px-5 py-4 font-bold text-[#06110d] shadow-[0_0_20px_rgba(79,243,208,0.25)] transition active:scale-[0.98] disabled:opacity-50"
          >
            {saving ? "保存中..." : "自動投稿設定を保存"}
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
      </div>
    </main>
  );
}