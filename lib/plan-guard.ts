import { SupabaseClient } from "@supabase/supabase-js";
import { PlanId, PLAN_LIMITS } from "@/lib/plans";

// 管理者用バックドア。環境変数 ADMIN_EMAILS に自分のログインメールを
// カンマ区切りで入れておくと、プランに関係なく全機能が使えるようになる。
// 例）ADMIN_EMAILS="me@example.com,teammate@example.com"
function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;

  const admins = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  return admins.includes(email.toLowerCase());
}

// PRO限定APIの入口で使う簡易ガード。
// service role クライアントで呼び出すこと。
export async function requirePlan(
  supabase: SupabaseClient,
  userId: string,
  allowed: PlanId[],
  email?: string | null
): Promise<{ ok: true; plan: PlanId } | { ok: false; plan: PlanId }> {
  if (isAdminEmail(email)) {
    return { ok: true, plan: "pro" };
  }

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
// - full:    PRO（および管理者）。データをそのまま見せる
// - preview: データ自体は返すが、フロント側で「モザイク」表示にして
//            中身は見せず、アップグレード導線だけ機能させる
//            （STARTERは常にこれ。FREEも freePreview オプションを渡した機能ではこれになる）
// - locked:  データ自体を返さない（FREE。支払い失敗・解約済みも同様）
export type AnalyticsAccess = "full" | "preview" | "locked";

export async function getAnalyticsAccess(
  supabase: SupabaseClient,
  userId: string,
  email?: string | null,
  options?: { freePreview?: boolean }
): Promise<{ plan: PlanId; access: AnalyticsAccess }> {
  if (isAdminEmail(email)) {
    return { plan: "pro", access: "full" };
  }

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
  const hasFullAccess = PLAN_LIMITS[effectivePlan].proAnalytics;

  let access: AnalyticsAccess;

  if (hasFullAccess) {
    access = "full";
  } else if (effectivePlan === "starter") {
    access = "preview";
  } else {
    // FREE（実質free扱いになったケースも含む）
    // freePreview: true の機能は、実データをモザイク表示にして見せて
    // 「使ってみたい」と思わせる集客導線にする
    access = options?.freePreview ? "preview" : "locked";
  }

  return { plan: effectivePlan, access };
}