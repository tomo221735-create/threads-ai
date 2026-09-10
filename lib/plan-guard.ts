import { SupabaseClient } from "@supabase/supabase-js";
import { PlanId } from "@/lib/plans";

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