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

**Amendments in contract 1.1.0 (Plan 3a).**
- `feature_spec.json` carries the served cutoff's Gamma-Gamma parameters, so the what-if recomputes AOV^GG, and with it V, when spend is edited. `build-snapshots` keeps the fit of every cutoff on its rows; `export` refuses to write when the parameters do not reproduce every served `aov_gg` to 1e-9. Golden vectors in `contracts/golden/gamma_gamma.json` pin the formula for the TypeScript twin.
- `evaluation.json` carries a value backtest: for customers who stayed, the revenue the value formula predicted for the label window against what they spent. On the test cutoff the formula is conservative overall (0.68×) and overstates only two-purchase customers (1.33×).
- `manifest.json` lists every model with its label, family and whether it is served, so the web app writes no model name in its code.

**Amendments in contract 1.2.0 (Plan 3c).**
- The release ships the model card as `model_card.md`, rendered by `export` from the same run and listed in `manifest.files`; the site renders it only after its SHA-256 matches. `docs/model-card.md` is a copy of it.
- `manifest.pipeline` records the run's seed, the Optuna trials and rolling-origin folds of the deployed model, and the label's `H` and eligibility `f`, which the Model and Method pages quote.
- Both are optional for a 1.1 reader.
