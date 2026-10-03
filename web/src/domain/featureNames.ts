/** Plain names for the model's inputs, for axes and tables (spec §3.1: no feature names on screen). */
const NAMES: Record<string, string> = {
  recency_days: "Days since last purchase",
  n_purchase_days: "Purchase days",
  tenure_days: "Days since first purchase",
  total_spend: "Total spend",
  avg_order_value: "Spend per purchase day",
  n_distinct_products: "Different products",
  return_rate: "Share of spend returned",
  spend_90d: "Spend in the last 90 days",
  spend_prev_90d: "Spend in the 90 days before",
  purchases_90d: "Purchase days in the last 90 days",
  cadence_cv: "Unevenness of the gaps",
  bought_same_window_last_year: "Bought this season last year",
  is_uk: "Based in the UK",
  cadence_days: "Usual gap between purchases",
  overdue_ratio: "Usual gaps since the last purchase",
  expected_purchases_h: "Purchases expected in 90 days",
  spend_trend: "Spend trend",
  cutoff_month_sin: "Month of the cutoff (sine)",
  cutoff_month_cos: "Month of the cutoff (cosine)",
};

export function featureName(name: string): string {
  return NAMES[name] ?? name.replaceAll("_", " ");
}
