"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";

export default function SettingsPage() {
  const router = useRouter();

  const [enabled, setEnabled] = useState(false);
  const [postTimes, setPostTimes] = useState<string[]>(["09:00"]);
  const MAX_POSTS_PER_DAY = 5;

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

      if (Array.isArray(data.post_times) && data.post_times.length > 0) {
        setPostTimes(
          data.post_times.map((t: string) => t.slice(0, 5))
        );
      } else {
        // 移行前の古いデータ（post_time_1〜3）からのフォールバック
        const legacyTimes = [
          data.post_time_1,
          data.post_time_2,
          data.post_time_3,
        ]
          .filter(Boolean)
          .map((t: string) => t.slice(0, 5));

        setPostTimes(legacyTimes.length > 0 ? legacyTimes : ["09:00"]);
      }

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
      posts_per_day: postTimes.length,
      post_times: postTimes,
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

  const addPostTime = () => {
    if (postTimes.length >= MAX_POSTS_PER_DAY) return;

    // 前の時間の2時間後くらいをデフォルト値にしておく
    const last = postTimes[postTimes.length - 1] ?? "09:00";
    const [h, m] = last.split(":").map(Number);
    const nextHour = (h + 2) % 24;
    const suggested = `${String(nextHour).padStart(2, "0")}:${String(
      m
    ).padStart(2, "0")}`;

    setPostTimes([...postTimes, suggested]);
  };

  const removePostTime = (index: number) => {
    if (postTimes.length <= 1) return;
    setPostTimes(postTimes.filter((_, i) => i !== index));
  };

  const updatePostTime = (index: number, value: string) => {
    setPostTimes(
      postTimes.map((t, i) => (i === index ? value : t))
    );
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

          {/* 投稿時間 */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <label className="block font-semibold text-text-primary">
                投稿時間（1日{postTimes.length}回）
              </label>

              <button
                type="button"
                onClick={addPostTime}
                disabled={postTimes.length >= MAX_POSTS_PER_DAY}
                className="text-sm font-bold text-accent-cyan transition disabled:cursor-not-allowed disabled:text-text-muted"
              >
                ＋ 時間を追加
              </button>
            </div>

            <div className="space-y-3">

              {postTimes.map((time, index) => (
                <div key={index} className="flex items-end gap-2">
                  <div className="flex-1">
                    <label className="text-sm text-text-muted">
                      {index + 1}回目
                    </label>

                    <input
                      type="time"
                      value={time}
                      onChange={(e) =>
                        updatePostTime(index, e.target.value)
                      }
                      className="mt-1 w-full rounded-xl border border-border-soft bg-surface-raised p-3 text-text-primary outline-none transition focus:border-accent-cyan/50 [color-scheme:dark]"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => removePostTime(index)}
                    disabled={postTimes.length <= 1}
                    className="mb-1 rounded-xl border border-border-soft px-3 py-3 text-sm text-text-muted transition hover:border-red-400/50 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    削除
                  </button>
                </div>
              ))}

            </div>

            <p className="mt-2 text-xs text-text-muted">
              最大{MAX_POSTS_PER_DAY}回まで設定できます。
            </p>
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