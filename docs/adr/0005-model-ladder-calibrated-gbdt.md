# 0005 — Model ladder, calibration and temporal validation

**Context.** A portfolio model has to show, in money, that it beats sensible alternatives. The origin project used a random split on a single snapshot and a recall-tuned model with balanced class weights. It had no calibration and no confidence intervals.

**Decision.**
- Model ladder: cadence rule → BG/NBD P(alive) → logistic regression → LightGBM tuned with Optuna.
- Every model is calibrated (isotonic or Platt) on a dedicated calibration cutoff.
- Splits: the test cutoff is 2011-09-10 and the calibration cutoff is 2011-06-10. Training uses the 10 cutoffs with `t + H ≤` the calibration cutoff (2010-06-10 to 2011-03-10). Tuning uses rolling-origin CV.
- Metrics: PR-AUC, ROC-AUC, Brier score with a reliability diagram, lift@k, EMP and profit. All carry customer-clustered bootstrap CIs.
- Explanations: SHAP, both global and per customer.

**Alternatives.**
- GBDT only: does not show that ML beats a simple rule.
- Adding TabPFN: hard to serve in the browser.
- A wide algorithm benchmark: dilutes the narrative.

**Amendments after the prototype.**
- **BTYD models are fitted by maximum likelihood with scipy** (Fader-Hardie closed-form likelihoods plus a small L2 penalty), not with PyMC-Marketing, whose PyTensor backend needs a C toolchain on Windows. Parameter-recovery tests validate the implementation.
- **Seasonality:** the churn rate varies from 24 % to 52 % across cutoffs.
  - The baselines rank reasonably well: BG/NBD reaches ROC-AUC 0.71. But their calibration does not transfer from June to September, so they lose money.
  - Neither seasonally matched calibration nor EM prior adjustment fixes this.
  - The context features `cutoff_month_sin` and `cutoff_month_cos`, together with `bought_same_window_last_year`, let LightGBM stay calibrated on the test cutoff (mean p 0.29 against an actual 0.31) in the untuned prototype.
  - Expected and realized profit are therefore always reported side by side.

**Consequences.**
- The evaluation framework is built before any complex model.
- The holdout label window covers the Q4 peak, so seasonality is reported.

**Amendments after Plan 2.**
- Tuning objective: mean rolling-origin log loss (a proper scoring rule), 40 seeded TPE trials per model. The logistic regression uses `log1p`, standardisation and L2 instead of splines.
- The deployed model was fixed in advance as LightGBM + season (top rung, servable as ONNX).
- Test cutoff, default economics: LightGBM + season realizes £23.1k [£15.7k, £31.7k] against £25.6k expected, with mean p 0.316 against an actual 0.308. The plain LightGBM ranks alike but realizes £15.0k against £62.9k expected. Six seeds give £19.4k–£23.1k.
- Rolling-origin folds cannot judge the month features, because no fold sees its validation month; the cutoffs after training (Apr–Sep 2011) can.
