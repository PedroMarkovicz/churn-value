# Architecture Decision Records

Short MADR-style records (Context · Decision · Alternatives · Consequences). All were accepted on 2026-09-26 during the design review; see [`../design.md`](../design.md).

| # | Decision |
|---|---|
| [0001](0001-dataset-online-retail-ii.md) | Dataset: UCI Online Retail II |
| [0002](0002-label-fixed-horizon-cadence-eligibility.md) | Label: fixed 90-day horizon + cadence-aware eligibility, monthly snapshots |
| [0003](0003-economics-emp-with-cac.md) | Economics: EMP extended with CAC, B = min(V, CAC), analytic decision rule, budget mode |
| [0004](0004-value-at-risk-conditional.md) | Value at risk V: conditional on staying, Gamma-Gamma AOV, configurable horizon T |
| [0005](0005-model-ladder-calibrated-gbdt.md) | Modelling: baseline ladder + calibrated LightGBM, rolling-origin temporal validation |
| [0006](0006-static-first-batch-architecture.md) | Architecture: static-first + batch scoring, Cloudflare Workers static assets |
| [0007](0007-frontend-vite-react-ts.md) | Frontend: Vite + React + TypeScript |
| [0008](0008-lean-mlops-mlflow-local.md) | ML engineering: lean pipeline + local MLflow, runs summary exported to the site |
| [0009](0009-whatif-parity-golden-vectors.md) | What-if: derived features in TS guarded by golden vectors; SHAP precomputed |
| [0010](0010-english-gbp.md) | Language: English; currency: £ |
| [0011](0011-monorepo-no-origin-data.md) | Monorepo, typed artifact contract, no data or code from the origin project |
