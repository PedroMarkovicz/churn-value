# churnvalue — ML pipeline

Profit-optimal churn retention on UCI Online Retail II. Design: [`../docs/design.md`](../docs/design.md).

## Reproduce

Requires [uv](https://docs.astral.sh/uv/) ≥ 0.12. From this directory:

    uv sync
    uv run churnvalue download            # ~45 MB, SHA-256 verified, ~1 min
    uv run churnvalue build-snapshots     # 16 monthly snapshots
    uv run churnvalue evaluate-baselines  # reports/baseline_evaluation.json

All parameters live in `configs/default.yaml`.

## Test

    uv run pytest            # fast suite, synthetic data, no network
    uv run pytest -m slow    # checks against the real dataset (after the pipeline ran)
    uv run ruff check . && uv run pyright

## Baseline results (test cutoff 2011-09-10, default economics)

| Policy | Contacted | Realized profit | 95 % CI |
|---|---|---|---|
| Do nothing | 0 | £0 | — |
| Contact all | 1,921 | −£129,712 | [−£166.7k, −£96.6k] |
| Cadence rule | 1,921 | −£129,712 | [−£166.7k, −£96.6k] |
| BG/NBD (calibrated) | 1,565 | −£23,461 | [−£38.1k, −£8.5k] |
| Oracle | 592 | £88,415 | [£79.0k, £98.6k] |

BG/NBD ranks reasonably well (ROC-AUC 0.71), but its calibration does not transfer across seasons, so it loses money. The supervised models in Plan 2 have to fix exactly this.
