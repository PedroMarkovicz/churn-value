/**
 * Derived features, the TypeScript twin of add_derived_features in ml/src/churnvalue/features.py.
 * The what-if recomputes them from edited base features (ADR 0009).
 */
export interface DerivedSettings {
  horizon_days: number;
  cadence_floor_days: number;
  spend_trend_eps: number;
}

export interface BaseFeatures {
  recency_days: number;
  n_purchase_days: number;
  tenure_days: number;
  spend_90d: number;
  spend_prev_90d: number;
}

export interface DerivedFeatures {
  cadence_days: number;
  overdue_ratio: number;
  expected_purchases_h: number;
  spend_trend: number;
}

export function derivedFeatures(base: BaseFeatures, settings: DerivedSettings): DerivedFeatures {
  const span = base.tenure_days - base.recency_days;
  const intervals = Math.max(base.n_purchase_days - 1, 1);
  const cadence = Math.max(span / intervals, settings.cadence_floor_days);
  return {
    cadence_days: cadence,
    overdue_ratio: base.recency_days / cadence,
    expected_purchases_h: settings.horizon_days / cadence,
    spend_trend: base.spend_90d / (base.spend_prev_90d + settings.spend_trend_eps),
  };
}
