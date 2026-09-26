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
