# 0002 — Label: fixed horizon + cadence-aware eligibility

**Context.** In non-contractual data, a naive "no purchase in H days" label mixes two groups. Customers with long purchase cycles appear to churn when they are simply between purchases, while short-cycle customers do not. The origin project handled this by filtering customers on an *expected next purchase window*.

**Decision.**
- Build monthly snapshots with H = 90 days.
- A customer is eligible when they have at least 2 purchase days and `last + cadence ∈ [t − f·H, t + H + f·H]`, with f = 0.5.
- `churn = 1` ⇔ no purchase in `(t, t+H]`.
- Cadence and the overdue ratio are used as features.

**Alternatives.**
- Plain fixed horizon: produces a noisier label.
- Per-customer threshold: the horizon then varies by customer, which breaks the economics window.
- Unsupervised P(alive): gives no labels to evaluate against, so it is kept as a baseline instead.

**Consequences.**
- Single-purchase customers are excluded. This is documented as a limitation.
- f is a documented parameter.
- Rolling snapshots multiply the number of training rows, which requires leakage-safe temporal splits (ADR 0005).
