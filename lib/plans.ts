// プラン定義（フロント・API 共通）
// 金額は税込・円（KOMOJU の amount は最小単位＝円をそのまま渡せばOK）

export type PlanId = "free" | "starter" | "pro";
export type PayablePlanId = "starter" | "pro";

export type PlanDefinition = {
  id: PlanId;
  name: string;
  price: number; // JPY, 0 = 無料
  period: "monthly";
  features: string[];
};

export const PLANS: Record<PlanId, PlanDefinition> = {
  free: {
    id: "free",
    name: "FREE",
    price: 0,
    period: "monthly",
    features: [
      "Threadsアカウント 1個",
      "AI投稿生成",
      "手動投稿",
      "ニュース・トレンドからネタ生成",
      "基本的なカスタム指示",
    ],
  },
  starter: {
    id: "starter",
    name: "STARTER",
    price: 980,
    period: "monthly",
    features: [
      "自動投稿 1日3回",
      "予約投稿 10件",
      "毎日・毎週の繰り返し",
      "地域ニュース / 業界ニュース / トレンド / イベント情報",
      "カスタム指示・AIによる投稿内容の最適化",
      "投稿時間を自由設定",
    ],
  },
  pro: {
    id: "pro",
    name: "PRO",
    price: 2980,
    period: "monthly",
    features: [
      "STARTERの全機能",
      "複数Threadsアカウント",
      "ベスト投稿時間の自動提案",
      "同ジャンルの人気投稿リサーチ",
      "パフォーマンスの推移グラフ",
    ],
  },
};

export const PAYABLE_PLAN_IDS: PayablePlanId[] = ["starter", "pro"];

export function isPayablePlan(plan: string): plan is PayablePlanId {
  return plan === "starter" || plan === "pro";
}

// STARTER/PRO それぞれの機能上限（サーバー側での制限チェックに使用）
export const PLAN_LIMITS = {
  free: {
    autoPostPerDay: 0,
    scheduledPostLimit: 0,
    maxThreadsAccounts: 1,
    proAnalytics: false,
  },
  starter: {
    autoPostPerDay: 3,
    scheduledPostLimit: 10,
    maxThreadsAccounts: 1,
    proAnalytics: false,
  },
  pro: {
    autoPostPerDay: 10,
    scheduledPostLimit: 100,
    maxThreadsAccounts: 5,
    proAnalytics: true,
  },
} as const;