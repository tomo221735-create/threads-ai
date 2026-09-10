"use client";

import { Suspense, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter, useSearchParams } from "next/navigation";
import { PLANS, PlanId, PAYABLE_PLAN_IDS } from "../../lib/plans";

type ProfileBilling = {
  plan: PlanId;
  plan_status: string;
};

function BillingPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<ProfileBilling | null>(null);
  const [processingPlan, setProcessingPlan] = useState<PlanId | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const success = searchParams.get("success");
    const cancelled = searchParams.get("cancelled");
    const errorParam = searchParams.get("error");

    if (success) setMessage("プランの更新が完了しました。");
    if (cancelled) setMessage("決済がキャンセルされました。");
    if (errorParam) setError("決済処理中にエラーが発生しました。時間をおいて再度お試しください。");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const load = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const user = session?.user;

      if (!user) {
        router.push("/login");
        return;
      }

      const { data, error: fetchError } = await supabase
        .from("profiles")
        .select("plan, plan_status")
        .eq("id", user.id)
        .maybeSingle();

      if (fetchError) {
        console.error(fetchError);
      } else if (data) {
        setProfile({
          plan: (data.plan as PlanId) ?? "free",
          plan_status: data.plan_status ?? "none",
        });
      } else {
        setProfile({ plan: "free", plan_status: "none" });
      }

      setLoading(false);
    };

    load();
  }, [router]);

  const currentPlan: PlanId =
    profile?.plan_status === "suspended" || profile?.plan_status === "cancelled"
      ? "free"
      : profile?.plan ?? "free";

  const handleSubscribe = async (plan: PlanId) => {
    if (plan === "free" || processingPlan) return;

    setError("");
    setMessage("");
    setProcessingPlan(plan);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {}),
        },
        body: JSON.stringify({ plan }),
      });

      const json = await res.json();

      if (!res.ok || !json.checkoutUrl) {
        setError(json.error || "決済ページの作成に失敗しました。");
        setProcessingPlan(null);
        return;
      }

      // Stripeのホスト決済ページ（外部ドメイン）へ遷移するため window.location を使用
      window.location.href = json.checkoutUrl;
    } catch (e) {
      console.error(e);
      setError("決済処理でエラーが発生しました。");
      setProcessingPlan(null);
    }
  };

  const handleCancel = async () => {
    if (!confirm("現在のプランを解約してFREEプランに戻します。よろしいですか？")) {
      return;
    }

    setError("");
    setMessage("");
    setProcessingPlan(currentPlan);

    try {
      const res = await fetch("/api/billing/cancel", { method: "POST" });
      const json = await res.json();

      if (!res.ok) {
        setError(json.error || "解約に失敗しました。");
      } else {
        setMessage("解約が完了しました。FREEプランに戻りました。");
        setProfile((prev) =>
          prev ? { ...prev, plan: "free", plan_status: "cancelled" } : prev
        );
      }
    } catch (e) {
      console.error(e);
      setError("解約処理でエラーが発生しました。");
    } finally {
      setProcessingPlan(null);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen px-4 py-8">
        <div className="mx-auto max-w-4xl text-text-muted">読み込み中...</div>
      </main>
    );
  }

  const planOrder: PlanId[] = ["free", "starter", "pro"];

  return (
    <main className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-5xl">
        <button
          onClick={() => router.push("/")}
          className="mb-6 text-sm text-text-muted transition hover:text-accent-cyan"
        >
          ← 戻る
        </button>

        <h1 className="text-3xl font-bold text-text-primary">プラン・お支払い</h1>
        <p className="mt-2 text-text-muted">
          プランはいつでも変更・解約できます。決済はStripeで安全に処理されます。
        </p>

        {message && (
          <div className="mt-4 rounded-xl border border-accent-cyan/30 bg-accent-cyan/10 px-4 py-3 text-sm text-accent-cyan">
            {message}
          </div>
        )}
        {error && (
          <div className="mt-4 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {planOrder.map((planId) => {
            const plan = PLANS[planId];
            const isCurrent = currentPlan === planId;
            const isPayable = (PAYABLE_PLAN_IDS as string[]).includes(planId);

            return (
              <section
                key={planId}
                className={`flex flex-col rounded-2xl border p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.02)] ${
                  isCurrent
                    ? "border-accent-cyan bg-surface-raised"
                    : "border-border-soft bg-surface"
                }`}
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-text-primary">
                    {plan.name}
                  </h2>
                  {isCurrent && (
                    <span className="rounded-full bg-accent-cyan px-3 py-1 text-xs font-bold text-[#06110d]">
                      現在のプラン
                    </span>
                  )}
                </div>

                <p className="mt-2 text-3xl font-bold text-text-primary">
                  {plan.price === 0 ? "0円" : `${plan.price.toLocaleString()}円`}
                  <span className="text-sm font-normal text-text-muted">
                    {plan.price > 0 ? " / 月" : ""}
                  </span>
                </p>

                <ul className="mt-4 flex-1 space-y-2 text-sm text-text-muted">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex gap-2">
                      <span className="text-accent-cyan">✓</span>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-6">
                  {isCurrent ? (
                    isPayable ? (
                      <button
                        onClick={handleCancel}
                        disabled={processingPlan !== null}
                        className="w-full rounded-full border border-border-soft bg-surface-raised px-5 py-2 text-sm font-bold text-text-muted transition hover:text-text-primary disabled:opacity-50"
                      >
                        解約する
                      </button>
                    ) : (
                      <div className="w-full rounded-full border border-border-soft px-5 py-2 text-center text-sm text-text-muted">
                        ご利用中
                      </div>
                    )
                  ) : isPayable ? (
                    <button
                      onClick={() => handleSubscribe(planId)}
                      disabled={processingPlan !== null}
                      className="w-full rounded-full bg-accent-cyan px-5 py-2 text-sm font-bold text-[#06110d] shadow-[0_0_16px_rgba(79,243,208,0.3)] transition disabled:opacity-50"
                    >
                      {processingPlan === planId
                        ? "処理中..."
                        : "このプランにする"}
                    </button>
                  ) : (
                    <div className="w-full rounded-full border border-border-soft px-5 py-2 text-center text-sm text-text-muted">
                      ダウングレードは「解約する」から
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>

        {profile?.plan_status === "retrying" && (
          <p className="mt-6 text-sm text-amber-300">
            お支払いの確認が取れませんでした。カード情報をご確認のうえ、再度お試しください。
          </p>
        )}
      </div>
    </main>
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={null}>
      <BillingPageInner />
    </Suspense>
  );
}