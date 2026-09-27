# 0009 — What-if feature parity via golden vectors

**Context.** The browser what-if lets users edit features. Derived features, such as the overdue ratio, must be recomputed exactly as in Python. Otherwise the model receives inconsistent inputs and gives wrong predictions without raising any error.

**Decision.**
- Users edit **base** features only. A small TS module recomputes the few **derived** features, which are simple arithmetic.
- Python exports `feature_spec.json` (feature order, dtypes and ranges) and golden vectors covering the derived features and the economics.
- Vitest fails on any divergence between TS and the golden vectors.
- A test checks that ONNX and native LightGBM predictions match.
- SHAP values are precomputed for real customers and are not recomputed in the what-if view.

**Alternatives.**
- Precomputed perturbation grids: interaction limited to discrete steps.
- Dropping derived features: likely to cost performance.

**Consequences.**
- Derived features stay few and arithmetic by design.
- Parity checks are part of CI.

**Amendments after Plan 2.**
- Golden vectors are split by what they depend on. Economics and derived features depend only on code, so they are committed under `contracts/golden/`, and a test fails when they are stale. The model vectors depend on the trained model and ship in the artifacts (`golden/model.json`).
- ONNX runs in float32. The month features are rounded to exact values, because sin(7π/6) = −0.4999999999999997 crossed a split at −0.5 after the cast. `churnvalue export` checks parity (≤ 1e-5) on every test customer and refuses to write artifacts otherwise.
- Per-customer SHAP excludes the month features, which are identical for everyone on one cutoff; they are folded into a month-adjusted baseline.
