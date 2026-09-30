"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";

type Settings = {
  enabled: boolean;
  keywords: string[];
  search_type: "TOP" | "RECENT";
  exclude_authors: string[];
  judge_criteria: string;
  reply_tone: string;
  max_candidates_per_run: number;
  auto_post: boolean;
  target_persona: string;
  comment_mode: "ai" | "template";
  comment_templates: string[];
  max_replies_per_day: number;
  max_replies_per_run: number;
  comment_instructions: string;
  comment_examples: string[];
  comment_max_length: number;
  last_auto_run_at?: string | null;
  last_auto_run_error?: string | null;
};

type Candidate = {
  id: string;
  keyword: string | null;
  threads_post_id: string;
  author_username: string | null;
  post_text: string;
  permalink: string | null;
  judge_passed: boolean;
  judge_reason: string | null;
  comment_draft: string | null;
  status: "pending" | "rejected" | "posted" | "failed";
  reply_post_id: string | null;
  error_message: string | null;
  created_at: string;
};

const DEFAULT_SETTINGS: Settings = {
  enabled: false,
  keywords: [],
  search_type: "RECENT",
  exclude_authors: [],
  judge_criteria: "",
  reply_tone: "親しみやすい",
  max_candidates_per_run: 10,
  auto_post: false,
  target_persona: "",
  comment_mode: "ai",
  comment_templates: [],
  max_replies_per_day: 10,
  max_replies_per_run: 3,
  comment_instructions: "",
  comment_examples: [],
  comment_max_length: 100,
};

const STATUS_LABEL: Record<Candidate["status"], string> = {
  pending: "確認待ち",
  rejected: "却下（対象外）",
  posted: "投稿済み",
  failed: "投稿失敗",
};

const STATUS_STYLE: Record<Candidate["status"], string> = {
  pending: "bg-accent-cyan/10 text-accent-cyan",
  rejected: "bg-surface-raised text-text-muted",
  posted: "bg-emerald-500/10 text-emerald-300",
  failed: "bg-red-500/10 text-red-300",
};

export default function EngagementPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [keywordsText, setKeywordsText] = useState("");
  const [excludeAuthorsText, setExcludeAuthorsText] = useState("");
  const [templatesText, setTemplatesText] = useState("");
  const [examplesText, setExamplesText] = useState("");

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [statusFilter, setStatusFilter] = useState<"pending" | "all">(
    "pending"
  );

  const [saving, setSaving] = useState(false);
  const [searching, setSearching] = useState(false);
  const [adhocKeyword, setAdhocKeyword] = useState("");
  const [postingId, setPostingId] = useState<string | null>(null);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    init();
  }, []);

  useEffect(() => {
    loadCandidates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const init = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push("/login");
      return;
    }

    await loadSettings();
    await loadCandidates();
    setLoading(false);
  };

  const loadSettings = async () => {
    const res = await fetch("/api/threads/engagement/settings");
    const data = await res.json().catch(() => null);

    if (res.ok && data?.settings) {
      const s = data.settings as Settings;
      setSettings({ ...DEFAULT_SETTINGS, ...s });
      setKeywordsText((s.keywords ?? []).join(", "));
      setExcludeAuthorsText((s.exclude_authors ?? []).join(", "));
      setTemplatesText((s.comment_templates ?? []).join("\n"));
      setExamplesText((s.comment_examples ?? []).join("\n"));
    }
  };

  const loadCandidates = async () => {
    const query =
      statusFilter === "pending" ? "?status=pending" : "";

    const res = await fetch(`/api/threads/engagement/candidates${query}`);
    const data = await res.json().catch(() => null);

    if (res.ok && data?.candidates) {
      setCandidates(data.candidates as Candidate[]);
    }
  };

  const saveSettings = async () => {
    setMessage("");
    setError("");
    setSaving(true);

    const keywords = keywordsText
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);

    const excludeAuthors = excludeAuthorsText
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean);

    const commentTemplates = templatesText
      .split("\n")
      .map((t) => t.trim())
      .filter(Boolean);

    const commentExamples = examplesText
      .split("\n")
      .map((t) => t.trim())
      .filter(Boolean);

    const res = await fetch("/api/threads/engagement/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...settings,
        keywords,
        exclude_authors: excludeAuthors,
        comment_templates: commentTemplates,
        comment_examples: commentExamples,
      }),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      setError(data?.error || "設定の保存に失敗しました。");
    } else {
      setMessage("設定を保存しました。");
      if (data?.settings) {
        setSettings({ ...DEFAULT_SETTINGS, ...data.settings });
      }
    }

    setSaving(false);
  };

  const runSearch = async (keywordOverride?: string) => {
    setMessage("");
    setError("");
    setSearching(true);

    const res = await fetch("/api/threads/engagement/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        keywordOverride ? { keyword: keywordOverride } : {}
      ),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      setError(data?.error || "検索に失敗しました。");
    } else if (data?.candidates?.length === 0) {
      setMessage(data.message || "新しい候補は見つかりませんでした。");
    } else {
      setMessage(
        `${data.candidates.length}件の候補を生成しました。下のリストを確認してください。`
      );
      setStatusFilter("pending");
      await loadCandidates();
    }

    setSearching(false);
  };

  const updateDraft = (id: string, text: string) => {
    setCandidates((prev) =>
      prev.map((c) => (c.id === id ? { ...c, comment_draft: text } : c))
    );
  };

  const saveDraft = async (candidate: Candidate) => {
    await fetch("/api/threads/engagement/candidates", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: candidate.id,
        comment_draft: candidate.comment_draft,
      }),
    });
  };

  const postComment = async (candidate: Candidate) => {
    setMessage("");
    setError("");
    setPostingId(candidate.id);

    await saveDraft(candidate);

    const res = await fetch("/api/threads/engagement/reply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: candidate.id }),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      setError(data?.error || "投稿に失敗しました。");
    } else {
      setMessage("コメントを投稿しました！");
      await loadCandidates();
    }

    setPostingId(null);
  };

  const rejectCandidate = async (id: string) => {
    await fetch(`/api/threads/engagement/candidates?id=${id}`, {
      method: "DELETE",
    });
    await loadCandidates();
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
          他ユーザー投稿へのエンゲージメント
        </h1>

        <p className="mt-2 text-text-muted">
          キーワードでThreads上の他ユーザーの投稿を検索し、AIが「コメントすべきか」を判定した上でコメント文を生成します。
        </p>

        <div className="mt-3 rounded-xl border border-accent-violet/30 bg-accent-violet/10 p-3 text-xs leading-5 text-accent-violet">
          ⚠️ 初期状態では、AIが生成したコメントは<strong>下書き</strong>として保存されるだけで、投稿は行われません。
          内容を確認・編集してから「投稿する」を押してください。
          「AIの判定だけで自動投稿する」をONにすると確認なしで即時投稿されるため、内容には十分ご注意ください。
          また、他ユーザーの投稿への機械的なコメントはThreadsの利用規約に抵触する可能性があるため、
          キーワードや判定基準は慎重に設定してください。
        </div>

        {message && (
          <p className="mt-4 rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-300">
            {message}
          </p>
        )}
        {error && (
          <p className="mt-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-300">
            {error}
          </p>
        )}

        {/* 設定 */}
        <section className="mt-6 space-y-4 rounded-2xl border border-border-soft bg-surface p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
          <div className="flex items-center justify-between">
            <label className="font-semibold text-text-primary">
              30分ごとに自動で検索・判定する
            </label>
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(e) =>
                setSettings({ ...settings, enabled: e.target.checked })
              }
              className="h-5 w-5 accent-accent-cyan"
            />
          </div>

          <div>
            <label className="mb-2 block font-semibold text-text-primary">
              探している投稿者像（自由記述）
            </label>
            <textarea
              value={settings.target_persona}
              onChange={(e) =>
                setSettings({ ...settings, target_persona: e.target.value })
              }
              rows={3}
              placeholder="例）お客さんが来なくて困っているサロンオーナー"
              className="w-full resize-none rounded-xl border border-border-soft bg-surface-raised p-3 text-text-primary outline-none transition focus:border-accent-cyan/50"
            />
            <p className="mt-1 text-xs text-text-muted">
              ここに書いた内容から、AIが自動でThreadsの検索キーワードを考えて検索します。
            </p>
          </div>

          <div>
            <label className="mb-2 block font-semibold text-text-primary">
              追加のキーワード（任意・カンマ区切りで複数可）
            </label>
            <input
              value={keywordsText}
              onChange={(e) => setKeywordsText(e.target.value)}
              placeholder="例）フリーランス 悩み, 副業 始め方"
              className="w-full rounded-xl border border-border-soft bg-surface-raised p-3 text-text-primary outline-none transition focus:border-accent-cyan/50"
            />
            <p className="mt-1 text-xs text-text-muted">
              上のペルソナ描写と合わせて検索されます。ペルソナ描写だけでも動作します。
            </p>
          </div>

          <div>
            <label className="mb-2 block font-semibold text-text-primary">
              コメントすべきか判定する基準（自由記述）
            </label>
            <textarea
              value={settings.judge_criteria}
              onChange={(e) =>
                setSettings({ ...settings, judge_criteria: e.target.value })
              }
              rows={3}
              placeholder="例）悩み相談や質問形式の投稿にだけコメントする。宣伝目的っぽい投稿はスキップする。"
              className="w-full resize-none rounded-xl border border-border-soft bg-surface-raised p-3 text-text-primary outline-none transition focus:border-accent-cyan/50"
            />
          </div>

          <div>
            <label className="mb-2 block font-semibold text-text-primary">
              コメントの作り方
            </label>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() =>
                  setSettings({ ...settings, comment_mode: "ai" })
                }
                className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                  settings.comment_mode === "ai"
                    ? "border-accent-cyan/50 bg-accent-cyan/10 text-accent-cyan"
                    : "border-border-soft bg-surface-raised text-text-muted"
                }`}
              >
                AIが自由に考える
              </button>

              <button
                type="button"
                onClick={() =>
                  setSettings({ ...settings, comment_mode: "template" })
                }
                className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                  settings.comment_mode === "template"
                    ? "border-accent-cyan/50 bg-accent-cyan/10 text-accent-cyan"
                    : "border-border-soft bg-surface-raised text-text-muted"
                }`}
              >
                登録した定型文を使う
              </button>
            </div>

            <p className="mt-1 text-xs text-text-muted">
              {settings.comment_mode === "ai"
                ? "投稿内容に合わせて、AIがコメント文をゼロから作成します。"
                : "下に登録した定型文の中から、AIが投稿内容に一番合うものを1つそのまま選んで使います（文面は変更しません）。"}
            </p>

            {settings.comment_mode === "ai" && (
              <div className="mt-3 space-y-3">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-text-primary">
                    コメント作成の指示（任意）
                  </label>
                  <textarea
                    value={settings.comment_instructions}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        comment_instructions: e.target.value,
                      })
                    }
                    rows={4}
                    maxLength={1000}
                    placeholder={
                      "例）\n・まず相手の気持ちに共感する一言から始める\n・最後は質問で終わらせず、応援の言葉で締める\n・絵文字は使わない\n・「〜ですよね」「〜かもしれませんね」など柔らかい語尾にする"
                    }
                    className="w-full resize-none rounded-xl border border-border-soft bg-surface-raised p-3 text-text-primary outline-none transition focus:border-accent-cyan/50"
                  />
                  <p className="mt-1 text-xs text-text-muted">
                    書いた内容は基本ルールより優先されます（最大1000文字）。
                  </p>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-text-primary">
                    参考にするコメント例（1行につき1件・最大5件）
                  </label>
                  <textarea
                    value={examplesText}
                    onChange={(e) => setExamplesText(e.target.value)}
                    rows={4}
                    placeholder={
                      "例）\nそれ、すごくわかります。私も同じところで悩んでました。\n続けてるだけで十分すごいと思います。応援してます！"
                    }
                    className="w-full resize-none rounded-xl border border-border-soft bg-surface-raised p-3 text-text-primary outline-none transition focus:border-accent-cyan/50"
                  />
                  <p className="mt-1 text-xs text-text-muted">
                    口調・長さ・構成を真似します。文面そのままのコピーはしません。
                  </p>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-text-primary">
                    コメントの最大文字数
                  </label>
                  <input
                    type="number"
                    min={20}
                    max={300}
                    value={settings.comment_max_length}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        comment_max_length: Number(e.target.value),
                      })
                    }
                    className="w-full rounded-xl border border-border-soft bg-surface-raised p-3 text-text-primary outline-none transition focus:border-accent-cyan/50"
                  />
                </div>
              </div>
            )}

            {settings.comment_mode === "template" && (
              <div className="mt-3">
                <label className="mb-2 block text-sm font-semibold text-text-primary">
                  定型文（1行につき1パターン）
                </label>
                <textarea
                  value={templatesText}
                  onChange={(e) => setTemplatesText(e.target.value)}
                  rows={5}
                  placeholder={
                    "例）\nわかります…！うちも最初そうでした。〇〇を試したら変わりましたよ！\n同じ悩みを持つ方多いですよね。応援してます！"
                  }
                  className="w-full resize-none rounded-xl border border-border-soft bg-surface-raised p-3 text-text-primary outline-none transition focus:border-accent-cyan/50"
                />
                <p className="mt-1 text-xs text-text-muted">
                  最低1件登録してください。合いそうな投稿が無い場合はコメントされません。
                </p>
              </div>
            )}
          </div>

          <div>
            <label className="mb-2 block font-semibold text-text-primary">
              除外するユーザー名（@なし、カンマ区切り）
            </label>
            <input
              value={excludeAuthorsText}
              onChange={(e) => setExcludeAuthorsText(e.target.value)}
              placeholder="例）competitor_account, spam_bot"
              className="w-full rounded-xl border border-border-soft bg-surface-raised p-3 text-text-primary outline-none transition focus:border-accent-cyan/50"
            />
          </div>

          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="mb-2 block font-semibold text-text-primary">
                検索順
              </label>
              <select
                value={settings.search_type}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    search_type: e.target.value as "TOP" | "RECENT",
                  })
                }
                className="w-full rounded-xl border border-border-soft bg-surface-raised p-3 text-text-primary outline-none transition focus:border-accent-cyan/50"
              >
                <option value="RECENT">新着順</option>
                <option value="TOP">人気順</option>
              </select>
            </div>

            <div className="flex-1">
              <label className="mb-2 block font-semibold text-text-primary">
                1回あたりの最大件数
              </label>
              <input
                type="number"
                min={1}
                max={30}
                value={settings.max_candidates_per_run}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    max_candidates_per_run: Number(e.target.value),
                  })
                }
                className="w-full rounded-xl border border-border-soft bg-surface-raised p-3 text-text-primary outline-none transition focus:border-accent-cyan/50"
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-red-500/20 bg-red-500/5 p-3">
            <div>
              <p className="font-semibold text-text-primary">
                AIの判定だけで自動返信まで行う
              </p>
              <p className="text-xs text-text-muted">
                ON：30分ごとに検索し、AIが「返信すべき」と判断した投稿へ自動で返信します。
                OFF：下書きの作成だけを自動で行い、投稿は手動です。
              </p>
            </div>
            <input
              type="checkbox"
              checked={settings.auto_post}
              onChange={(e) =>
                setSettings({ ...settings, auto_post: e.target.checked })
              }
              className="h-5 w-5 accent-red-400"
            />
          </div>

          <div className="flex gap-4">
            <div className="flex-1">
              <label className="mb-2 block font-semibold text-text-primary">
                1日の自動返信の上限
              </label>
              <input
                type="number"
                min={1}
                max={30}
                value={settings.max_replies_per_day}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    max_replies_per_day: Number(e.target.value),
                  })
                }
                className="w-full rounded-xl border border-border-soft bg-surface-raised p-3 text-text-primary outline-none transition focus:border-accent-cyan/50"
              />
            </div>
            <div className="flex-1">
              <label className="mb-2 block font-semibold text-text-primary">
                30分ごとの自動返信の上限
              </label>
              <input
                type="number"
                min={1}
                max={5}
                value={settings.max_replies_per_run}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    max_replies_per_run: Number(e.target.value),
                  })
                }
                className="w-full rounded-xl border border-border-soft bg-surface-raised p-3 text-text-primary outline-none transition focus:border-accent-cyan/50"
              />
            </div>
          </div>

          {settings.last_auto_run_at && (
            <p className="text-xs text-text-muted">
              最終自動実行：
              {new Date(settings.last_auto_run_at).toLocaleString("ja-JP")}
              {settings.last_auto_run_error &&
                `（${settings.last_auto_run_error}）`}
            </p>
          )}

          <button
            onClick={saveSettings}
            disabled={saving}
            className="w-full rounded-xl bg-accent-cyan py-3 font-semibold text-bg transition hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "保存中..." : "設定を保存"}
          </button>
        </section>

        {/* 手動検索 */}
        <section className="mt-6 space-y-3 rounded-2xl border border-border-soft bg-surface p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
          <h2 className="text-xl font-bold text-text-primary">
            今すぐ検索して下書きを作る
          </h2>

          <div className="flex gap-2">
            <input
              value={adhocKeyword}
              onChange={(e) => setAdhocKeyword(e.target.value)}
              placeholder="お試しキーワード（空欄なら保存済みキーワードで検索）"
              className="flex-1 rounded-xl border border-border-soft bg-surface-raised p-3 text-text-primary outline-none transition focus:border-accent-cyan/50"
            />
            <button
              onClick={() => runSearch(adhocKeyword.trim() || undefined)}
              disabled={searching}
              className="rounded-xl bg-accent-violet px-5 py-3 font-semibold text-bg transition hover:opacity-90 disabled:opacity-50"
            >
              {searching ? "検索中..." : "検索する"}
            </button>
          </div>
        </section>

        {/* 候補一覧 */}
        <section className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-text-primary">候補一覧</h2>

            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as "pending" | "all")
              }
              className="rounded-xl border border-border-soft bg-surface-raised p-2 text-sm text-text-primary outline-none"
            >
              <option value="pending">確認待ちのみ</option>
              <option value="all">すべて</option>
            </select>
          </div>

          {candidates.length === 0 && (
            <p className="text-sm text-text-muted">
              候補がありません。「検索する」を押して生成してください。
            </p>
          )}

          {candidates.map((c) => (
            <div
              key={c.id}
              className="space-y-3 rounded-2xl border border-border-soft bg-surface p-5"
            >
              <div className="flex items-center justify-between text-xs text-text-muted">
                <span>
                  @{c.author_username ?? "不明"}
                  {c.keyword ? `　検索語: ${c.keyword}` : ""}
                </span>
                <span
                  className={`rounded-full px-2 py-1 ${STATUS_STYLE[c.status]}`}
                >
                  {STATUS_LABEL[c.status]}
                </span>
              </div>

              <p className="rounded-xl bg-surface-raised p-3 text-sm text-text-primary">
                {c.post_text}
              </p>

{c.permalink && (
   <a
    href={c.permalink}
    target="_blank"
    rel="noreferrer"
    className="text-xs text-accent-cyan hover:underline"
  >
    投稿を見る →
     </a>
)}

              {c.judge_reason && (
                <p className="text-xs text-text-muted">
                  AI判定理由: {c.judge_reason}
                </p>
              )}

              {c.status === "pending" && (
                <>
                  <textarea
                    value={c.comment_draft ?? ""}
                    onChange={(e) => updateDraft(c.id, e.target.value)}
                    onBlur={() => saveDraft(c)}
                    rows={3}
                    maxLength={100}
                    className="w-full resize-none rounded-xl border border-border-soft bg-surface-raised p-3 text-text-primary outline-none transition focus:border-accent-cyan/50"
                  />

                  <div className="flex gap-2">
                    <button
                      onClick={() => postComment(c)}
                      disabled={postingId === c.id}
                      className="flex-1 rounded-xl bg-accent-cyan py-2 font-semibold text-bg transition hover:opacity-90 disabled:opacity-50"
                    >
                      {postingId === c.id ? "投稿中..." : "投稿する"}
                    </button>
                    <button
                      onClick={() => rejectCandidate(c.id)}
                      className="rounded-xl border border-border-soft px-4 py-2 text-text-muted transition hover:text-red-300"
                    >
                      却下
                    </button>
                  </div>
                </>
              )}

              {c.status === "failed" && c.error_message && (
                <p className="text-xs text-red-300">{c.error_message}</p>
              )}

              {c.status === "posted" && (
                <p className="text-xs text-emerald-300">
                  投稿済み（reply id: {c.reply_post_id}）
                </p>
              )}
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}