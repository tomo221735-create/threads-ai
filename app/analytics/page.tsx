"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";

type AnalyticsAccess = "full" | "preview" | "locked";

type WeekPoint = {
  weekStart: string;
  label: string;
  postCount: number;
  totalLikes: number;
  totalReplies: number;
  totalViews: number;
  avgEngagement: number;
};

type PerformanceResponse = {
  success: boolean;
  hasEnoughData: boolean;
  access?: AnalyticsAccess;
  plan?: string;
  message?: string;
  weekly: WeekPoint[];
  overall: {
    totalPosts: number;
    weeksTracked: number;
    latestWeek: WeekPoint | null;
    previousWeek: WeekPoint | null;
    trend: "up" | "down" | "flat" | null;
  } | null;
};

type HourBucket = {
  hour: number;
  label: string;
  postCount: number;
  avgEngagement: number;
  avgLikes: number;
  avgReplies: number;
  avgViews: number;
};

type BestTimesResponse = {
  success: boolean;
  hasEnoughData: boolean;
  access?: AnalyticsAccess;
  plan?: string;
  message?: string;
  lowConfidence?: boolean;
  totalPosts?: number;
  buckets: HourBucket[];
  recommended: HourBucket[];
};

type GenreTrendState = {
  access: AnalyticsAccess | null;
  plan: string | null;
  summary: string | null;
  updatedAt: string | null;
};

// 依存ライブラリを増やさないための、軽量な折れ線グラフ（SVG手描き）
function TrendLineChart({ data }: { data: WeekPoint[] }) {
  if (data.length === 0) return null;

  const width = 600;
  const height = 220;
  const padding = { top: 16, right: 16, bottom: 28, left: 36 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const maxEngagement = Math.max(...data.map((d) => d.avgEngagement), 1);

  const points = data.map((d, i) => {
    const x =
      data.length === 1
        ? padding.left + chartW / 2
        : padding.left + (chartW * i) / (data.length - 1);
    const y =
      padding.top + chartH - (d.avgEngagement / maxEngagement) * chartH;
    return { x, y, d };
  });

  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");

  const areaD =
    `${pathD} L${points[points.length - 1].x.toFixed(1)},${(
      padding.top + chartH
    ).toFixed(1)} L${points[0].x.toFixed(1)},${(padding.top + chartH).toFixed(
      1
    )} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full"
      role="img"
      aria-label="週ごとのエンゲージメント推移"
    >
      <defs>
        <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4ff3d0" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#4ff3d0" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* 横グリッド線 */}
      {[0, 0.5, 1].map((r) => (
        <line
          key={r}
          x1={padding.left}
          x2={width - padding.right}
          y1={padding.top + chartH * (1 - r)}
          y2={padding.top + chartH * (1 - r)}
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={1}
        />
      ))}

      <path d={areaD} fill="url(#trendFill)" stroke="none" />
      <path d={pathD} fill="none" stroke="#4ff3d0" strokeWidth={2} />

      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={3.5} fill="#4ff3d0" />
          <text
            x={p.x}
            y={height - 8}
            textAnchor="middle"
            fontSize="10"
            fill="#8d96ac"
          >
            {p.d.label}
          </text>
        </g>
      ))}

      <text x={4} y={padding.top + 4} fontSize="10" fill="#8d96ac">
        {maxEngagement}
      </text>
      <text x={4} y={padding.top + chartH} fontSize="10" fill="#8d96ac">
        0
      </text>
    </svg>
  );
}

// 時間帯別のおすすめ度を横棒グラフで表示
function HourBarChart({ buckets }: { buckets: HourBucket[] }) {
  if (buckets.length === 0) return null;

  const max = Math.max(...buckets.map((b) => b.avgEngagement), 1);

  return (
    <div className="space-y-1.5">
      {buckets.map((b) => (
        <div key={b.hour} className="flex items-center gap-2">
          <span className="w-12 shrink-0 text-xs text-text-muted">
            {b.label}
          </span>
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-surface-raised">
            <div
              className="h-full rounded-full bg-gradient-to-r from-accent-cyan to-accent-violet"
              style={{
                width: `${Math.max((b.avgEngagement / max) * 100, b.postCount > 0 ? 4 : 0)}%`,
              }}
            />
          </div>
          <span className="w-10 shrink-0 text-right text-xs text-text-faint">
            {b.postCount}件
          </span>
        </div>
      ))}
    </div>
  );
}

// PRO限定セクションの上にかぶせる「モザイク」オーバーレイ。
// STARTER（access: "preview"）向け。中身はぼかして見せつつ、アップグレード導線を出す。
function UpgradeOverlay({
  onUpgrade,
  message = "PROプランで解除できます",
}: {
  onUpgrade: () => void;
  message?: string;
}) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-xl bg-surface/55 px-6 text-center backdrop-blur-[3px]">
      <span className="text-2xl" aria-hidden>
        🔒
      </span>
      <p className="text-sm font-semibold text-text-primary">{message}</p>
      <button
        onClick={onUpgrade}
        className="rounded-full bg-gradient-to-r from-accent-cyan to-accent-violet px-5 py-2 text-xs font-bold text-[#06110d] shadow-[0_0_16px_rgba(79,243,208,0.25)] transition active:scale-[0.98]"
      >
        プランを見る
      </button>
    </div>
  );
}

// FREE向け：完全ロック時の案内（データ自体を見せない）
function LockedNotice({
  message,
  onUpgrade,
}: {
  message: string;
  onUpgrade: () => void;
}) {
  return (
    <div className="mt-4 rounded-xl border border-white/10 bg-surface-raised p-4 text-center">
      <p className="text-sm text-text-muted">{message}</p>
      <button
        onClick={onUpgrade}
        className="mt-4 rounded-full bg-gradient-to-r from-accent-cyan to-accent-violet px-5 py-2 text-xs font-bold text-[#06110d] shadow-[0_0_16px_rgba(79,243,208,0.25)] transition active:scale-[0.98]"
      >
        プランを見る
      </button>
    </div>
  );
}

export default function AnalyticsPage() {
  const router = useRouter();
  const goToBilling = () => router.push("/billing");

  const [authLoading, setAuthLoading] = useState(true);

  const [performance, setPerformance] = useState<PerformanceResponse | null>(
    null
  );
  const [bestTimes, setBestTimes] = useState<BestTimesResponse | null>(null);

  const [genreTrend, setGenreTrend] = useState<GenreTrendState>({
    access: null,
    plan: null,
    summary: null,
    updatedAt: null,
  });
  const [genreTrendLoading, setGenreTrendLoading] = useState(false);
  const [genreTrendError, setGenreTrendError] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    checkAuthAndLoad();
  }, []);

  const checkAuthAndLoad = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push("/login");
      return;
    }

    setAuthLoading(false);
    await loadData();
  };

  const loadData = async () => {
    setLoading(true);
    setError("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setError("ログインしてください。");
        setLoading(false);
        return;
      }

      const [perfRes, timesRes, genreRes] = await Promise.all([
        fetch("/api/threads/performance"),
        fetch("/api/threads/best-times"),
        fetch("/api/threads/genre-trends"),
      ]);

      const perfData = await perfRes.json();
      const timesData = await timesRes.json();
      const genreData = await genreRes.json();

      if (!perfRes.ok) {
        throw new Error(perfData?.error || "分析データの取得に失敗しました。");
      }

      if (!timesRes.ok) {
        throw new Error(timesData?.error || "分析データの取得に失敗しました。");
      }

      setPerformance(perfData);
      setBestTimes(timesData);

      if (genreRes.ok) {
        setGenreTrend({
          access: genreData.access ?? null,
          plan: genreData.plan ?? null,
          summary: genreData.summary ?? null,
          updatedAt: genreData.updatedAt ?? null,
        });
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "分析データの取得に失敗しました。"
      );
    } finally {
      setLoading(false);
    }
  };

  const refreshGenreTrend = async () => {
    if (genreTrend.access !== "full") {
      goToBilling();
      return;
    }

    setGenreTrendLoading(true);
    setGenreTrendError("");

    try {
      const response = await fetch("/api/threads/genre-trends", {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "ジャンルトレンドの分析に失敗しました。");
      }

      setGenreTrend({
        access: data.access ?? genreTrend.access,
        plan: data.plan ?? genreTrend.plan,
        summary: data.summary ?? null,
        updatedAt: data.updatedAt ?? null,
      });

      if (!data.summary && data.message) {
        setGenreTrendError(data.message);
      }
    } catch (err) {
      setGenreTrendError(
        err instanceof Error ? err.message : "ジャンルトレンドの分析に失敗しました。"
      );
    } finally {
      setGenreTrendLoading(false);
    }
  };

  if (authLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center text-text-muted">
        読み込み中...
      </main>
    );
  }

  // セクションごとにアクセスレベルが異なる場合があるので、それぞれ個別に持つ
  // （performance/best-timesはFREEもプレビュー、genre-trendsはFREEはロックのまま、など）
  const performanceAccess: AnalyticsAccess = performance?.access ?? "locked";
  const bestTimesAccess: AnalyticsAccess = bestTimes?.access ?? "locked";
  const genreAccess: AnalyticsAccess = genreTrend.access ?? "locked";

  const anyPreview =
    performanceAccess === "preview" ||
    bestTimesAccess === "preview" ||
    genreAccess === "preview";

  const trendLabel =
    performance?.overall?.trend === "up"
      ? "📈 前週より伸びています"
      : performance?.overall?.trend === "down"
        ? "📉 前週より落ちています"
        : performance?.overall?.trend === "flat"
          ? "➡️ 前週から横ばいです"
          : null;

  return (
    <main className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-2xl">
        <button
          onClick={() => router.push("/")}
          className="mb-6 text-sm text-text-muted transition hover:text-accent-cyan"
        >
          ← 戻る
        </button>

        <h1 className="text-3xl font-bold text-text-primary">投稿分析</h1>
        <p className="mt-2 text-text-muted">
          過去の投稿データから、伸びている傾向とおすすめの投稿時間をまとめています。
        </p>

        {anyPreview && (
          <div className="mt-4 rounded-xl border border-accent-cyan/20 bg-accent-cyan/5 px-4 py-3 text-xs text-text-muted">
            一部の項目はプレビュー表示です。PROプランで全てのデータを確認できます。
          </div>
        )}

        {error && (
          <div className="mt-6 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
            {error}
          </div>
        )}

        {loading ? (
          <div className="mt-8 text-center text-text-muted">
            分析中...
          </div>
        ) : (
          <>
            {/* パフォーマンス推移 */}
            <section className="relative mt-8 rounded-2xl border border-border-soft bg-surface p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-text-primary">
                  週ごとのパフォーマンス推移
                </h2>
                {trendLabel && performanceAccess === "full" && (
                  <span className="text-xs font-semibold text-accent-cyan">
                    {trendLabel}
                  </span>
                )}
              </div>

              {performanceAccess === "locked" ? (
                <LockedNotice
                  message={
                    performance?.message ??
                    "パフォーマンスの推移グラフはPROプラン限定機能です。"
                  }
                  onUpgrade={goToBilling}
                />
              ) : !performance?.hasEnoughData ? (
                <p className="mt-4 text-sm text-text-muted">
                  {performance?.message ??
                    "データがまだありません。ホーム画面で「投稿を分析」を実行してください。"}
                </p>
              ) : (
                <div className="relative mt-4">
                  {performanceAccess === "preview" && (
                    <UpgradeOverlay onUpgrade={goToBilling} />
                  )}

                  <div
                    className={
                      performanceAccess === "preview"
                        ? "pointer-events-none select-none blur-sm"
                        : ""
                    }
                  >
                    <p className="text-sm text-text-muted">
                      1投稿あたりの平均エンゲージメント（いいね＋返信×2＋リポスト×2＋引用×2）
                    </p>

                    <div className="mt-4">
                      <TrendLineChart data={performance.weekly} />
                    </div>

                    {performance.overall?.latestWeek && (
                      <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                        <div className="rounded-xl bg-surface-raised p-3">
                          <p className="text-xs text-text-muted">直近週の投稿数</p>
                          <p className="mt-1 text-lg font-bold text-text-primary">
                            {performance.overall.latestWeek.postCount}
                          </p>
                        </div>
                        <div className="rounded-xl bg-surface-raised p-3">
                          <p className="text-xs text-text-muted">平均いいね</p>
                          <p className="mt-1 text-lg font-bold text-text-primary">
                            {Math.round(
                              performance.overall.latestWeek.totalLikes /
                                Math.max(performance.overall.latestWeek.postCount, 1)
                            )}
                          </p>
                        </div>
                        <div className="rounded-xl bg-surface-raised p-3">
                          <p className="text-xs text-text-muted">平均閲覧</p>
                          <p className="mt-1 text-lg font-bold text-text-primary">
                            {Math.round(
                              performance.overall.latestWeek.totalViews /
                                Math.max(performance.overall.latestWeek.postCount, 1)
                            )}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </section>

            {/* ベスト投稿時間 */}
            <section className="relative mt-6 rounded-2xl border border-border-soft bg-surface p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
              <h2 className="font-bold text-text-primary">
                おすすめの投稿時間帯
              </h2>

              {bestTimesAccess === "locked" ? (
                <LockedNotice
                  message={
                    bestTimes?.message ??
                    "おすすめの投稿時間帯はPROプラン限定機能です。"
                  }
                  onUpgrade={goToBilling}
                />
              ) : !bestTimes?.hasEnoughData ? (
                <p className="mt-4 text-sm text-text-muted">
                  {bestTimes?.message ??
                    "データがまだありません。ホーム画面で「投稿を分析」を実行してください。"}
                </p>
              ) : (
                <div className="relative mt-4">
                  {bestTimesAccess === "preview" && (
                    <UpgradeOverlay onUpgrade={goToBilling} />
                  )}

                  <div
                    className={
                      bestTimesAccess === "preview"
                        ? "pointer-events-none select-none blur-sm"
                        : ""
                    }
                  >
                    <p className="text-sm text-text-muted">
                      過去の投稿を時間帯別に集計し、反応が良かった時間帯を推定しています。
                    </p>

                    {bestTimes.lowConfidence && (
                      <p className="mt-2 rounded-lg border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
                        投稿数がまだ少ないため（{bestTimes.totalPosts}件）、参考値としてご覧ください。投稿数が増えるほど精度が上がります。
                      </p>
                    )}

                    <div className="mt-4 flex flex-wrap gap-2">
                      {bestTimes.recommended
                        .filter(
                          (r) =>
                            Number.isInteger(r.hour) && r.hour >= 0 && r.hour <= 23
                        )
                        .map((r, i) => (
                          <div
                            key={r.hour}
                            className="rounded-full border border-accent-cyan/30 bg-accent-cyan/10 px-4 py-1.5 text-sm font-bold text-accent-cyan"
                          >
                            {i + 1}位 {r.label}
                          </div>
                        ))}
                    </div>

                    <div className="mt-5">
                      <HourBarChart buckets={bestTimes.buckets} />
                    </div>

                    <button
                      onClick={() => router.push("/settings")}
                      disabled={bestTimesAccess !== "full"}
                      className="mt-5 w-full rounded-xl border border-border-soft px-4 py-3 text-sm font-semibold text-text-primary transition hover:border-accent-cyan/40 disabled:opacity-50"
                    >
                      自動投稿の時間設定を変更する →
                    </button>
                  </div>
                </div>
              )}
            </section>

            {/* ジャンルトレンドリサーチ */}
            <section className="relative mt-6 rounded-2xl border border-border-soft bg-surface p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-bold text-text-primary">
                    今、同じジャンルで効いている切り口
                  </h2>
                  <p className="mt-1 text-sm text-text-muted">
                    Web記事をもとに、今このジャンルで反応が良さそうな投稿の切り口をAIが推測します。
                  </p>
                </div>

                <button
                  onClick={refreshGenreTrend}
                  disabled={genreTrendLoading || genreAccess === "locked"}
                  className="shrink-0 rounded-full bg-gradient-to-r from-accent-cyan to-accent-violet px-4 py-2 text-xs font-bold text-[#06110d] shadow-[0_0_16px_rgba(79,243,208,0.25)] transition active:scale-[0.98] disabled:opacity-50"
                >
                  {genreAccess === "preview"
                    ? "PROで更新"
                    : genreTrendLoading
                      ? "分析中..."
                      : "更新する"}
                </button>
              </div>

              <p className="mt-3 rounded-lg border border-white/10 bg-surface-raised px-3 py-2 text-xs text-text-faint">
                ※ Threads公式APIは他アカウントの投稿を取得できないため、これは実際の人気Threads投稿ではなく、Web記事の傾向からAIが推測した参考情報です。ネタ出し（投稿ネタ生成）に自動で反映されます。
              </p>

              {genreTrendError && (
                <p className="mt-3 text-sm text-amber-200">{genreTrendError}</p>
              )}

              {genreAccess === "locked" ? (
                <LockedNotice
                  message="同ジャンルの人気投稿リサーチはPROプラン限定機能です。"
                  onUpgrade={goToBilling}
                />
              ) : (
                <div className="relative mt-4">
                  {genreAccess === "preview" && (
                    <UpgradeOverlay onUpgrade={goToBilling} />
                  )}

                  <div
                    className={
                      genreAccess === "preview"
                        ? "pointer-events-none select-none blur-sm"
                        : ""
                    }
                  >
                    {genreTrend.summary ? (
                      <div className="whitespace-pre-wrap rounded-xl bg-surface-raised p-4 text-sm leading-relaxed text-text-primary">
                        {genreTrend.summary}
                      </div>
                    ) : (
                      !genreTrendLoading && (
                        <p className="text-sm text-text-muted">
                          まだ分析されていません。「更新する」を押してください。
                        </p>
                      )
                    )}

                    {genreTrend.updatedAt && (
                      <p className="mt-3 text-xs text-text-faint">
                        最終更新：
                        {new Date(genreTrend.updatedAt).toLocaleString("ja-JP")}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}