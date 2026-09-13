import { SupabaseClient } from "@supabase/supabase-js";
import { PlanId, PLAN_LIMITS } from "@/lib/plans";

// PRO限定APIの入口で使う簡易ガード。
// service role クライアントで呼び出すこと。
export async function requirePlan(
  supabase: SupabaseClient,
  userId: string,
  allowed: PlanId[]
): Promise<{ ok: true; plan: PlanId } | { ok: false; plan: PlanId }> {
  const { data } = await supabase
    .from("profiles")
    .select("plan, plan_status")
    .eq("id", userId)
    .maybeSingle();

  const plan = (data?.plan as PlanId) ?? "free";
  const status = data?.plan_status ?? "none";

  // 支払い失敗・解約済みは free 相当として扱う
  const effectivePlan: PlanId =
    status === "suspended" || status === "cancelled" ? "free" : plan;

  if (allowed.includes(effectivePlan)) {
    return { ok: true, plan: effectivePlan };
  }

  return { ok: false, plan: effectivePlan };
}

// PRO限定の分析系機能向け。プランごとに3段階のアクセスレベルを返す。
// - full:    PRO。データをそのまま見せる
// - preview: STARTER。データ自体は返すが、フロント側で「モザイク」表示にして
//            中身は見せず、アップグレード導線だけ機能させる
// - locked:  FREE（および支払い失敗・解約済み）。データ自体を返さない
export type AnalyticsAccess = "full" | "preview" | "locked";

export async function getAnalyticsAccess(
  supabase: SupabaseClient,
  userId: string
): Promise<{ plan: PlanId; access: AnalyticsAccess }> {
  const { data } = await supabase
    .from("profiles")
    .select("plan, plan_status")
    .eq("id", userId)
    .maybeSingle();

  const plan = (data?.plan as PlanId) ?? "free";
  const status = data?.plan_status ?? "none";

  // 支払い失敗・解約済みは free 相当として扱う
  const effectivePlan: PlanId =
    status === "suspended" || status === "cancelled" ? "free" : plan;

  // lib/plans.ts の PLAN_LIMITS.proAnalytics を唯一の判定基準にする
  // （どのプランがPRO分析機能を持つかはそこだけ見れば分かるようにしておく）
  const access: AnalyticsAccess = PLAN_LIMITS[effectivePlan].proAnalytics
    ? "full"
    : effectivePlan === "starter"
      ? "preview"
      : "locked";

  return { plan: effectivePlan, access };
}